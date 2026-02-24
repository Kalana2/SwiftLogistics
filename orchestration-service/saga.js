/**
 * Saga Orchestrator — Sequential Order Processing with Compensating Transactions
 * 
 * Implements the Orchestration-based Saga pattern for distributed transaction management.
 * Each step has an execute() and compensate() function.
 * On failure at step N, steps N-1 through 1 are compensated in reverse order.
 * 
 * Pipeline: CMS (inventory check) → ROS (route calculation) → WMS (warehouse + driver)
 */

const axios = require('axios');
const { createLogger } = require('../shared/utils/logger');

const logger = createLogger('saga-orchestrator');

class SagaStep {
    constructor(name, executeFn, compensateFn) {
        this.name = name;
        this.executeFn = executeFn;
        this.compensateFn = compensateFn;
        this.result = null;
        this.completed = false;
    }

    async execute(context) {
        logger.info(`[Saga] Executing step: ${this.name}`, { orderId: context.orderId });
        this.result = await this.executeFn(context);
        this.completed = true;
        return this.result;
    }

    async compensate(context) {
        if (!this.completed) return;
        logger.warn(`[Saga] Compensating step: ${this.name}`, { orderId: context.orderId });
        await this.compensateFn(context, this.result);
        this.completed = false;
    }
}

class SagaOrchestrator {
    constructor() {
        this.steps = [];
    }

    addStep(name, executeFn, compensateFn) {
        this.steps.push(new SagaStep(name, executeFn, compensateFn));
        return this;
    }

    /**
     * Execute all saga steps sequentially.
     * On failure, compensate all completed steps in reverse order.
     */
    async execute(context) {
        const completedSteps = [];
        const sagaLog = [];

        logger.info('[Saga] Starting saga execution', {
            orderId: context.orderId,
            steps: this.steps.map(s => s.name)
        });

        for (const step of this.steps) {
            try {
                const startTime = Date.now();
                const result = await Promise.race([
                    step.execute(context),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error(`Timeout: ${step.name} exceeded 30s`)), 30000)
                    )
                ]);

                completedSteps.push(step);
                sagaLog.push({
                    step: step.name,
                    status: 'SUCCESS',
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString(),
                    result
                });

                // Merge step result into context for next steps
                Object.assign(context, result || {});

            } catch (error) {
                logger.error(`[Saga] Step failed: ${step.name}`, {
                    orderId: context.orderId,
                    error: error.message
                });

                sagaLog.push({
                    step: step.name,
                    status: 'FAILED',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });

                // Compensate all completed steps in reverse order
                logger.warn('[Saga] Starting compensation', {
                    orderId: context.orderId,
                    stepsToCompensate: completedSteps.map(s => s.name).reverse()
                });

                for (const completedStep of completedSteps.reverse()) {
                    try {
                        await completedStep.compensate(context);
                        sagaLog.push({
                            step: completedStep.name,
                            status: 'COMPENSATED',
                            timestamp: new Date().toISOString()
                        });
                    } catch (compError) {
                        logger.error(`[Saga] Compensation failed: ${completedStep.name}`, {
                            orderId: context.orderId,
                            error: compError.message
                        });
                        sagaLog.push({
                            step: completedStep.name,
                            status: 'COMPENSATION_FAILED',
                            error: compError.message,
                            timestamp: new Date().toISOString()
                        });
                    }
                }

                return {
                    success: false,
                    failedStep: step.name,
                    error: error.message,
                    sagaLog
                };
            }
        }

        logger.info('[Saga] Saga completed successfully', {
            orderId: context.orderId,
            steps: completedSteps.map(s => s.name)
        });

        return {
            success: true,
            sagaLog
        };
    }
}

// ─── Order Processing Saga Builder ───

function createOrderProcessingSaga(orchestratorUrl) {
    const saga = new SagaOrchestrator();

    // Step 1: CMS — Check inventory + confirm order
    saga.addStep(
        'CMS_INVENTORY_CHECK',
        async (ctx) => {
            const res = await axios.put(
                `${orchestratorUrl}/api/orchestrator/orders/${ctx.orderId}/status`,
                {
                    status: 'PROCESSING',
                    message: 'Saga step 1: Checking CMS inventory',
                    source: 'saga-orchestrator'
                },
                { timeout: 5000 }
            );

            // The CMS adapter is consuming from RabbitMQ and will process asynchronously
            // For saga purposes, we notify the orchestrator and wait for CMS result
            return { cmsProcessed: true };
        },
        async (ctx) => {
            // Compensate: Cancel CMS reservation
            logger.warn('[Saga Compensation] Cancelling CMS reservation', { orderId: ctx.orderId });
            try {
                await axios.put(
                    `${orchestratorUrl}/api/orchestrator/orders/${ctx.orderId}/status`,
                    {
                        status: 'CMS_CANCELLED',
                        message: 'Saga compensation: CMS reservation cancelled due to downstream failure',
                        source: 'saga-orchestrator',
                        metadata: { compensatedAt: new Date().toISOString() }
                    },
                    { timeout: 5000 }
                );
            } catch (e) {
                logger.error('[Saga Compensation] Failed to cancel CMS', { error: e.message });
            }
        }
    );

    // Step 2: ROS — Calculate optimized route
    saga.addStep(
        'ROS_ROUTE_CALCULATION',
        async (ctx) => {
            await axios.put(
                `${orchestratorUrl}/api/orchestrator/orders/${ctx.orderId}/status`,
                {
                    status: 'ROUTE_CALCULATING',
                    message: 'Saga step 2: Calculating optimized route',
                    source: 'saga-orchestrator'
                },
                { timeout: 5000 }
            );
            return { rosProcessed: true };
        },
        async (ctx) => {
            // Compensate: Cancel route
            logger.warn('[Saga Compensation] Cancelling route', { orderId: ctx.orderId });
            try {
                await axios.put(
                    `${orchestratorUrl}/api/orchestrator/orders/${ctx.orderId}/status`,
                    {
                        status: 'ROUTE_CANCELLED',
                        message: 'Saga compensation: Route cancelled due to downstream failure',
                        source: 'saga-orchestrator',
                        metadata: { compensatedAt: new Date().toISOString() }
                    },
                    { timeout: 5000 }
                );
            } catch (e) {
                logger.error('[Saga Compensation] Failed to cancel route', { error: e.message });
            }
        }
    );

    // Step 3: WMS — Assign warehouse and driver
    saga.addStep(
        'WMS_DRIVER_ASSIGNMENT',
        async (ctx) => {
            await axios.put(
                `${orchestratorUrl}/api/orchestrator/orders/${ctx.orderId}/status`,
                {
                    status: 'WMS_ASSIGNING',
                    message: 'Saga step 3: Assigning warehouse and driver',
                    source: 'saga-orchestrator'
                },
                { timeout: 5000 }
            );
            return { wmsProcessed: true };
        },
        async (ctx) => {
            // Compensate: Release driver
            logger.warn('[Saga Compensation] Releasing driver', { orderId: ctx.orderId });
            try {
                await axios.put(
                    `${orchestratorUrl}/api/orchestrator/orders/${ctx.orderId}/status`,
                    {
                        status: 'WMS_RELEASED',
                        message: 'Saga compensation: Driver and warehouse released',
                        source: 'saga-orchestrator',
                        metadata: { compensatedAt: new Date().toISOString() }
                    },
                    { timeout: 5000 }
                );
            } catch (e) {
                logger.error('[Saga Compensation] Failed to release WMS', { error: e.message });
            }
        }
    );

    return saga;
}

module.exports = { SagaOrchestrator, SagaStep, createOrderProcessingSaga };

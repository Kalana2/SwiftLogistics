// App entry — initializes router, registers pages
import { route, startRouter } from './router.js';
import { renderLogin } from './pages/login.js';
import { renderClientDashboard } from './pages/client-dashboard.js';
import { renderDriverDashboard } from './pages/driver-dashboard.js';

// Register routes
route('/login', renderLogin, false);
route('/dashboard', renderClientDashboard, true);
route('/driver', renderDriverDashboard, true);

// Start
startRouter();

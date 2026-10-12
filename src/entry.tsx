import {createRoot} from 'react-dom/client';
import App from './main';
import {registerPublicShell} from './pwa';

createRoot(document.getElementById('root')!).render(<App/>);
void registerPublicShell();

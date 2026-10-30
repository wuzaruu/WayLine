import { createRoot } from 'react-dom/client';
import App from './App';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import './dark.css';
import './mobile.css';
createRoot(document.getElementById('root')!).render(<App />);

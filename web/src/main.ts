import 'leaflet/dist/leaflet.css';
import './styles.css';
import { createApp } from 'vue';
import App from './App.vue';
import { applyTextSize } from './lib/prefs';
import { router } from './router';

applyTextSize();
createApp(App).use(router).mount('#app');

import { mount } from 'svelte';
import App from './App.svelte';
import '@fontsource-variable/inter/opsz.css';
import './styles/tokens.css';
import './styles/app.css';
import './styles/shell.css';
import './styles/cards.css';
import './styles/editor.css';
// item 15: empty state, toast and import motion.
import './styles/motion.css';
// end item 15
import './styles/buttons.css';
import { mountDropdowns } from './lib/ui/dropdown.js';

mountDropdowns();

mount(App, { target: document.getElementById('app')! });

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

mount(App, { target: document.getElementById('app')! });

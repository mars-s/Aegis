import { mount } from 'svelte';
import App from './App.svelte';
import '@fontsource-variable/inter/opsz.css';
import './styles/tokens.css';
import './styles/app.css';
import './styles/shell.css';
import './styles/cards.css';
import './styles/editor.css';

mount(App, { target: document.getElementById('app')! });

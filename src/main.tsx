import { render } from 'preact';
import { App } from './app.tsx';
import './styles.css';
import { applyTheme } from './ui/prefs.ts';

applyTheme();

render(<App />, document.getElementById('app')!);

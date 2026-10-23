import { createRoot } from 'react-dom/client'
import './styles/luna.css'
import './styles/noir.css'
import { App } from './App'
import { init } from './store'

init().then(() => createRoot(document.getElementById('root')!).render(<App />))

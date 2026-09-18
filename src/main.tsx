import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { getCoordinatorDisplayName } from '@/features/auth/AuthContext'
import { useCoordinatorNames } from '@/lib/handover'

/*
 * Let the data layer name a coordinator without importing React.
 *
 * It runs on the server too, where there is no roster to import; there it
 * falls back to the shipped one. Registered here so a name edited in the admin
 * panel still wins in the browser.
 */
useCoordinatorNames((id) => {
  const name = getCoordinatorDisplayName(id)
  return name === 'Unknown' ? null : name
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

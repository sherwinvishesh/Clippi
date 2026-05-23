import { Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Editor  from './pages/Editor'

export default function App() {
  return (
    <Routes>
      <Route path="/"     element={<Landing />} />
      <Route path="/edit" element={<Editor />} />
    </Routes>
  )
}
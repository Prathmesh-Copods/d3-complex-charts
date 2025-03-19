import { useState } from 'react'
import Tabs from './components/Tabs/Tabs'
import Treemap from './components/charts/Treemap/Treemap'
import PackedCircles from './components/charts/PackedCircles/PackedCircles'
import './App.scss'

// Tab definitions including component to render and label
interface Tab {
  id: string;
  label: string;
  component: React.ReactNode;
}

function App() {
  // Define available tabs
  const tabs: Tab[] = [
    { id: 'treemap', label: 'Treemap', component: <Treemap /> },
    { id: 'packed-circles', label: 'Packed Circles', component: <PackedCircles /> },
    { id: 'network', label: 'Network Graph', component: <div>Network Graph (Coming soon)</div> },
    { id: 'geo', label: 'Geographic Map', component: <div>Geographic Map (Coming soon)</div> },
  ];

  // Track the active tab
  const [activeTab, setActiveTab] = useState<string>(tabs[0].id);

  return (
    <div className="app">
      <h1>D3.js Complex Visualizations</h1>
      
      <Tabs 
        tabs={tabs} 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
      />
      
      <div className="content">
        {/* Render the active tab's component */}
        {tabs.find(tab => tab.id === activeTab)?.component}
      </div>
    </div>
  )
}

export default App
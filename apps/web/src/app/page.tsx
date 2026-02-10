import { Activity } from 'lucide-react'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-background">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto">
          <Activity className="w-9 h-9 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-bold">Karibu Health</h1>
        <p className="text-muted-foreground">Clinical Documentation System</p>
      </div>
    </main>
  )
}

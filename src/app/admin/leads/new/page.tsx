import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import LeadGeneratorForm from './LeadGeneratorForm'

export default function NewLeadPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center gap-4 px-8 py-4 border-b border-border bg-white">
        <Link href="/admin" className="text-muted-foreground hover:text-primary transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <span className="text-lg font-bold tracking-tight text-primary font-sans uppercase">Generate Outreach Portfolio</span>
      </nav>

      <main className="max-w-4xl mx-auto p-8 mt-4">
        <div className="mb-8">
           <h1 className="text-3xl font-bold text-primary tracking-tight">Outreach Generator</h1>
           <p className="text-muted-foreground mt-1 font-medium">Generate a premium client landing page in under 90 seconds.</p>
        </div>
        
        <LeadGeneratorForm />
      </main>
    </div>
  )
}

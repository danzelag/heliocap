import { login } from './actions'
import { Zap } from 'lucide-react'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams;
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-8 bg-card p-8 rounded-sm shadow-xl border border-border">
        <div className="space-y-4 text-center">
          <div className="w-12 h-12 bg-primary rounded-sm flex items-center justify-center mx-auto">
            <Zap className="text-white w-7 h-7 fill-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-primary">Helio Cap Admin</h1>
            <p className="text-sm text-muted-foreground mt-1">Authorized personnel only.</p>
          </div>
        </div>

        <form className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Email</label>
            <input 
              id="email" 
              name="email" 
              type="email" 
              required 
              className="w-full px-3 py-3 border border-border rounded-sm bg-white text-primary focus:outline-none focus:ring-2 focus:ring-primary" 
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Password</label>
            <input 
              id="password" 
              name="password" 
              type="password" 
              required 
              className="w-full px-3 py-3 border border-border rounded-sm bg-white text-primary focus:outline-none focus:ring-2 focus:ring-primary" 
            />
          </div>
          
          {params?.error === 'invalid' && (
             <p className="text-sm font-semibold text-destructive text-center">Invalid email or password.</p>
          )}

          <button 
            formAction={login} 
            className="w-full bg-primary hover:bg-secondary text-white py-3 rounded-sm font-bold tracking-wider transition-colors"
          >
            SECURE LOGIN
          </button>
        </form>
      </div>
    </div>
  )
}

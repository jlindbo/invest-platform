import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from './pages/Dashboard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000, // 30 seconds
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-blue-600">
                  J Group Invest Corp
                </h1>
                <p className="text-gray-600 mt-1">
                  Norwegian Stock Market Intelligence Platform
                </p>
              </div>
              <div className="text-sm text-gray-500">
                {new Date().toLocaleDateString('nb-NO', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          <Dashboard />
        </main>

        <footer className="bg-white border-t mt-12 py-6">
          <div className="container mx-auto px-4 text-center text-gray-600 text-sm">
            <p>J Group Invest Corp - Norwegian Stock Market Prediction Platform</p>
            <p className="mt-1">Educational and Research Use Only</p>
          </div>
        </footer>
      </div>
    </QueryClientProvider>
  );
}

export default App;

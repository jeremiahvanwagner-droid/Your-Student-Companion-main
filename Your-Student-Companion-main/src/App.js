import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import { Toaster } from "@/components/ui/sonner";
import Gatekeeper from "@/components/Gatekeeper";
import HomePage from "@/pages/HomePage";

// Get Clerk Publishable Key from environment
const clerkPubKey = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;

// Clerk appearance customization to match Truth Blue theme
const clerkAppearance = {
  baseTheme: undefined,
  variables: {
    colorPrimary: 'hsl(166, 100%, 70%)', // Electric cyan accent
    colorBackground: 'hsl(217, 64%, 11%)', // Deep navy background
    colorText: 'hsl(226, 56%, 88%)', // Slate gray text
    colorTextSecondary: 'hsl(226, 40%, 60%)', // Muted text
    colorInputBackground: 'hsl(217, 55%, 14%)', // Card background
    colorInputText: 'hsl(226, 56%, 88%)',
    borderRadius: '0.625rem',
    fontFamily: "'IBM Plex Sans', sans-serif",
  },
  elements: {
    card: {
      backgroundColor: 'hsl(217, 55%, 14%)',
      border: '1px solid hsl(217, 40%, 22%)',
      boxShadow: '0 4px 20px -4px hsl(217 64% 5% / 0.5)',
    },
    formButtonPrimary: {
      backgroundColor: 'hsl(166, 100%, 70%)',
      color: 'hsl(217, 64%, 11%)',
      '&:hover': {
        backgroundColor: 'hsl(166, 100%, 60%)',
      },
    },
    formFieldInput: {
      backgroundColor: 'hsl(217, 55%, 14%)',
      borderColor: 'hsl(217, 40%, 22%)',
      color: 'hsl(226, 56%, 88%)',
      '&:focus': {
        borderColor: 'hsl(166, 100%, 70%)',
      },
    },
    footerActionLink: {
      color: 'hsl(166, 100%, 70%)',
    },
    headerTitle: {
      color: 'hsl(226, 56%, 88%)',
    },
    headerSubtitle: {
      color: 'hsl(226, 40%, 60%)',
    },
    socialButtonsBlockButton: {
      backgroundColor: 'hsl(217, 50%, 18%)',
      borderColor: 'hsl(217, 40%, 22%)',
      color: 'hsl(226, 56%, 88%)',
      '&:hover': {
        backgroundColor: 'hsl(217, 45%, 20%)',
      },
    },
    dividerLine: {
      backgroundColor: 'hsl(217, 40%, 22%)',
    },
    dividerText: {
      color: 'hsl(226, 40%, 60%)',
    },
  },
};

function App() {
  // If no Clerk key is configured, show a warning in development
  if (!clerkPubKey) {
    console.warn('[Clerk] No publishable key found. Set REACT_APP_CLERK_PUBLISHABLE_KEY in .env');
    
    // In development without key, show the app without auth
    return (
      <div className="min-h-screen bg-background text-foreground">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Gatekeeper />} />
            <Route path="/app" element={<HomePage />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" richColors />
      </div>
    );
  }

  return (
    <ClerkProvider 
      publishableKey={clerkPubKey}
      appearance={clerkAppearance}
    >
      <div className="min-h-screen bg-background text-foreground">
        <BrowserRouter>
          <Routes>
            {/* Main route uses Gatekeeper for auth-based routing */}
            <Route path="/" element={<Gatekeeper />} />
            {/* Direct app access (protected by Gatekeeper logic) */}
            <Route path="/app" element={<HomePage />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" richColors />
      </div>
    </ClerkProvider>
  );
}

export default App;

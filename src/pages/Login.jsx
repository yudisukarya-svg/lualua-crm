import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import logoWhite from "@/assets/logo-white.png";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { signIn, signUp, resetPassword } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  const [mode, setMode] = useState("login"); // login | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await signIn(email, password);
        if (error) throw error;
        navigate(from, { replace: true });
      } else if (mode === "signup") {
        const { error } = await signUp(email, password, fullName);
        if (error) throw error;
        toast({ title: "Account created", description: "Check your email to confirm, then sign in." });
        setMode("login");
      } else {
        const { error } = await resetPassword(email);
        if (error) throw error;
        toast({ title: "Reset link sent", description: "Check your inbox for password reset instructions." });
        setMode("login");
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Something went wrong", description: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3">
          <img src={logoWhite} alt="Lualua Crochet & Knitting" className="h-9 w-auto" />
        </div>
        <div>
          <h2 className="max-w-sm text-3xl font-semibold leading-tight">
            One thread for every customer, sample, and shipment.
          </h2>
          <p className="mt-4 max-w-sm text-primary-foreground/80">
            The production CRM that replaces scattered chats, spreadsheets, and folders with a single place your team trusts.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/70">Internal use · up to 5 team members</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Reset password"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "login" ? "Enter your credentials to continue." :
             mode === "signup" ? "The first account becomes the admin." :
             "We'll email you a reset link."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} required />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "login" && (
                    <button type="button" onClick={() => setMode("forgot")}
                      className="text-xs text-primary hover:underline">Forgot password?</button>
                  )}
                </div>
                <Input id="password" type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>No account yet?{" "}
                <button onClick={() => setMode("signup")} className="font-medium text-primary hover:underline">Create one</button>
              </>
            ) : (
              <button onClick={() => setMode("login")} className="font-medium text-primary hover:underline">Back to sign in</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { cn } from '@/lib/utils/tailwind.util';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthContext } from '@/contexts/AuthContext';
import { getAuthPrerequisits } from '@/lib/api/endpoints/labelstudio/direct';
import { cn } from '@/lib/utils/tailwind.util';
import React, { useCallback, useEffect, useState } from 'react';

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const { loginAction } = useAuthContext();

  const [csrfMiddlewareToken, setToken] = useState<string>('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement> | undefined) => {
      await loginAction(email, password, csrfMiddlewareToken, e);
    },
    [loginAction, csrfMiddlewareToken, email, password],
  );

  useEffect(() => {
    async function fetchMiddlewareToken(): Promise<void> {
      const token = await getAuthPrerequisits();
      setToken(token);
    }
    fetchMiddlewareToken().then((_) => {});
  }, []);

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card className="border-sidebar-border">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Login</CardTitle>
          <CardDescription>Login with your email and password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-8">
              <div className="flex flex-col gap-3">
                <div className="grid gap-3">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="qocr@example.com"
                    required={true}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="grid gap-3">
                  <div className="flex items-center">
                    <Label htmlFor="password">Password</Label>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="⋅⋅⋅⋅⋅⋅⋅⋅"
                    required={true}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Button
                  type="submit"
                  className="w-full h-10 font-extrabold rounded-4xl cursor-pointer"
                >
                  Log in
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

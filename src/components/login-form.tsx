import { cn } from '@/lib/utils/tailwind.util';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils/tailwind.util';
import React, { useCallback, useEffect, useState } from 'react';

import { getTokensByCredentials } from '@/lib/api/endpoints/jwt';
import {
  directLogin,
  getAuthPrerequisits,
} from '@/lib/api/endpoints/labelstudio/direct';

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<'form'>) {
  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card className="border-sidebar-border">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Login</CardTitle>
          <CardDescription>Login with your email and password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin}>
            <div className="grid gap-8">
              <div className="flex flex-col gap-3">
                <div className="grid gap-3">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="m@example.com"
                    required
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
                    required
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

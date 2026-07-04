import { useState, useEffect } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signInWithEmail(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUpWithEmail(
    email: string,
    password: string,
    fullName: string
  ) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
  }

  /**
   * Used by Google, Facebook, and Apple native OAuth flows.
   * The caller obtains an id_token/access_token from the platform's SDK,
   * then passes it here to complete the Supabase sign-in.
   */
  async function signInWithIdToken(
    provider: 'google' | 'facebook' | 'apple',
    token: string,
    nonce?: string
  ) {
    const { error } = await supabase.auth.signInWithIdToken({
      provider,
      token,
      nonce,
    });
    if (error) throw error;
  }

  async function sendPasswordResetEmail(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'kharcha://reset-password',
    });
    if (error) throw error;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  return {
    session,
    user,
    loading,
    signInWithEmail,
    signUpWithEmail,
    signInWithIdToken,
    sendPasswordResetEmail,
    signOut,
  };
}

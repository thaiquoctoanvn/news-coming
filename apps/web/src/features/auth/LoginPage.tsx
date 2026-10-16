import { Alert, Button, Card, Input, InputOTP, REGEXP_ONLY_DIGITS } from '@heroui/react';
import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '../../lib/auth.tsx';
import { requestLoginCode, verifyLoginCode } from '../../lib/functions.ts';
import { useSupabase } from '../../lib/supabase.ts';

type Step = 'username' | 'code';

export function LoginPage() {
  const db = useSupabase();
  const auth = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('username');
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  if (!auth.isLoading && auth.isAdmin) return <Navigate to="/quan-tri" replace />;

  const run = async (action: () => Promise<void>) => {
    setIsBusy(true);
    setError(null);
    try {
      await action();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Đã có lỗi xảy ra');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRequest = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      setNotice(await requestLoginCode(db, username.trim()));
      setStep('code');
    });
  };

  const handleVerify = (value: string) => {
    void run(async () => {
      await verifyLoginCode(db, value);
      navigate('/quan-tri', { replace: true });
    });
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <Card className="gap-4 p-6">
        <Card.Title className="font-serif text-2xl font-bold">Đăng nhập quản trị</Card.Title>
        {step === 'username' ? (
          <form onSubmit={handleRequest} className="flex flex-col gap-3">
            <label htmlFor="username" className="text-sm font-medium">Tên đăng nhập</label>
            <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <Button type="submit" variant="primary" isDisabled={!username.trim() || isBusy}>
              {isBusy ? 'Đang gửi…' : 'Gửi mã đăng nhập'}
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            {notice && <p className="text-sm text-muted">{notice} Mã gồm 6 chữ số, hết hạn sau 10 phút (kiểm tra cả thư mục Spam).</p>}
            <InputOTP
              aria-label="Mã đăng nhập"
              maxLength={6}
              pattern={REGEXP_ONLY_DIGITS}
              value={code}
              onChange={setCode}
              onComplete={handleVerify}
              isDisabled={isBusy}
            >
              <InputOTP.Group>
                {Array.from({ length: 6 }, (_, i) => <InputOTP.Slot key={i} index={i} />)}
              </InputOTP.Group>
            </InputOTP>
            <Button variant="primary" isDisabled={code.length !== 6 || isBusy} onPress={() => handleVerify(code)}>
              {isBusy ? 'Đang kiểm tra…' : 'Đăng nhập'}
            </Button>
            <Button variant="ghost" size="sm" onPress={() => { setStep('username'); setCode(''); }}>Gửi lại mã</Button>
          </div>
        )}
        {error && (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content><Alert.Description>{error}</Alert.Description></Alert.Content>
          </Alert>
        )}
      </Card>
    </main>
  );
}

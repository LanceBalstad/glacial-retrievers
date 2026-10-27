import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type User } from "firebase/auth";
import {
  auth,
  isAllowedAdminEmail,
  loginWithGoogle,
  logoutFromFirebase,
  subscribeToAuth,
} from "../../lib/firebase";
import "./adminLogin.css";

const AdminLogin = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToAuth((nextUser: User | null) => {
      setUser(nextUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (user && isAllowedAdminEmail(user.email)) {
      navigate("/admin/home", { replace: true });
    }
  }, [navigate, user]);

  const handleGoogleLogin = async () => {
    try {
      setError(null);
      await loginWithGoogle();
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Unable to sign in with Google right now.",
      );
    }
  };

  const handleLogout = async () => {
    try {
      setError(null);
      await logoutFromFirebase();
    } catch (logoutError) {
      setError(
        logoutError instanceof Error
          ? logoutError.message
          : "Unable to sign out right now.",
      );
    }
  };

  if (!auth) {
    return (
      <main className="admin-page">
        <section className="admin-card">
          <h1>Admin access unavailable</h1>
          <p>
            Firebase configuration is still missing. Add your Firebase values to
            the .env file.
          </p>
        </section>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="admin-page">
        <section className="admin-card">
          <h1>Checking access…</h1>
        </section>
      </main>
    );
  }

  if (user && !isAllowedAdminEmail(user.email)) {
    return (
      <main className="admin-page">
        <section className="admin-card admin-access-denied">
          <h1>Access denied</h1>
          <p>This Google account is not allowed to manage Glacial Retrievers.</p>
          <button type="button" onClick={handleLogout}>
            Sign out
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <section className="admin-card">
        <p className="admin-eyebrow">Admin</p>
        <h1>Admin login</h1>
        <p>Sign in with Google to manage the available dogs list.</p>
        <button type="button" className="admin-login-button" onClick={handleGoogleLogin}>
          Sign in with Google
        </button>
        {error && <p className="admin-error">{error}</p>}
      </section>
    </main>
  );
};

export default AdminLogin;

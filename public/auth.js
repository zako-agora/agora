const SUPABASE_URL = 'https://tcfglmmhxkmfnhmpwkuv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjZmdsbW1oeGttZm5obXB3a3V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMTE0NDgsImV4cCI6MjEwODU4NzQ0OH0.1nI4tI7kx9Bgbs6GgwV0WLNyAdZMgXHz5510eBM9Q7E';

const scriptSupabase = document.createElement('script');
scriptSupabase.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

scriptSupabase.onload = () => {
  const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const authBtn = document.getElementById('auth-btn');

  async function updateAuthUI() {
    if (!authBtn) return;
    const { data: { session } } = await sbClient.auth.getSession();
    
    if (session) {
      const email = session.user.email;
      authBtn.textContent = email.split('@')[0];
      authBtn.href = "#";
      authBtn.onclick = async (e) => {
        e.preventDefault();
        await sbClient.auth.signOut();
        window.location.reload();
      };
      authBtn.title = "Cliquez pour vous déconnecter";
      authBtn.style.background = "rgba(16, 185, 129, 0.2)";
      authBtn.style.borderColor = "rgba(16, 185, 129, 0.5)";
    } else {
      authBtn.textContent = "Connexion";
      authBtn.href = "/login.html";
      authBtn.onclick = null;
      authBtn.title = "Se connecter";
      authBtn.style.background = "rgba(255,255,255,0.1)";
      authBtn.style.borderColor = "rgba(255,255,255,0.2)";
    }
  }

  updateAuthUI();
  sbClient.auth.onAuthStateChange(() => {
    updateAuthUI();
  });
};

document.head.appendChild(scriptSupabase);
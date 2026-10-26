const SUPABASE_URL = 'https://tcfglmmhxkmfnhmpwkuv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjZmdsbW1oeGttZm5obXB3a3V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMTE0NDgsImV4cCI6MjEwODU4NzQ0OH0.1nI4tI7kx9Bgbs6GgwV0WLNyAdZMgXHz5510eBM9Q7E';

const scriptSupabase = document.createElement('script');
scriptSupabase.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

scriptSupabase.onload = () => {
  const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const authBtn = document.getElementById('auth-btn');

  async function updateAuthUI() {
    if (!authBtn) return;
    
    // On récupère la session actuelle
    const { data: { session } } = await sbClient.auth.getSession();
    
    if (session) {
      // L'utilisateur est connecté
      const username = session.user.user_metadata?.username;
      authBtn.textContent = username || session.user.email.split('@')[0];
      authBtn.href = "#";
      authBtn.onclick = async (e) => {
        e.preventDefault();
        await sbClient.auth.signOut();
        window.location.reload();
      };
      authBtn.title = "Cliquez pour vous déconnecter";
      authBtn.style.background = "rgba(16, 185, 129, 0.2)"; // Vert
      authBtn.style.borderColor = "rgba(16, 185, 129, 0.5)";
    } else {
      // L'utilisateur n'est pas connecté
      authBtn.textContent = "Connexion";
      authBtn.href = "/login.html";
      authBtn.onclick = null;
      authBtn.title = "Se connecter";
      authBtn.style.background = "rgba(255,255,255,0.1)";
      authBtn.style.borderColor = "rgba(255,255,255,0.2)";
    }
  }

  // On lance la vérification au chargement
  updateAuthUI();

  // On écoute les changements (si l'utilisateur se connecte dans un autre onglet)
  sbClient.auth.onAuthStateChange(() => {
    updateAuthUI();
  });
};

document.head.appendChild(scriptSupabase);

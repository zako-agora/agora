// --- GESTION DE LA VOIX ELEVENLABS (Version robuste) ---
document.addEventListener('click', async (e) => {
  // 1. On cherche si on a cliqué sur un bouton de lecture (peu importe son type exact)
  const btn = e.target.closest('button, .spk, .vt');
  if (!btn) return;

  // 2. On vérifie que c'est bien un bouton "écouter" (il contient l'icône 🔊 ou ⏹)
  if (!btn.textContent.includes('🔊') && !btn.textContent.includes('⏹')) return;

  // 3. On coupe immédiatement la voix du navigateur
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  // 4. On cherche le texte de la réponse associée
  const card = btn.closest('.rep');
  if (!card) return;
  const textElement = card.querySelector('.tx');
  if (!textElement) return;
  
  const text = textElement.textContent;
  if (!text) return;

  // 5. On change l'icône pendant le chargement
  const originalText = btn.textContent;
  btn.textContent = '⏳';

  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!response.ok) throw new Error('Erreur serveur ' + response.status);

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    
    audio.play();
    audio.onended = () => {
      btn.textContent = originalText;
      URL.revokeObjectURL(url);
    };
    
  } catch (err) {
    console.error('Erreur TTS:', err);
    btn.textContent = '❌';
    setTimeout(() => btn.textContent = originalText, 2000);
  }
});

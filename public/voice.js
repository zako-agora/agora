// --- GESTION DE LA VOIX ELEVENLABS ---
document.addEventListener('click', async (e) => {
  if (window.speechSynthesis) { window.speechSynthesis.cancel(); }
  // On vérifie si le clic vient d'un bouton avec l'icône 🔊
  if (e.target.tagName === 'BUTTON' && e.target.textContent.includes('🔊')) {
    
    // On cherche le texte de la réponse associée (la div avec la classe 'tx')
    const card = e.target.closest('.rep');
    if (!card) return;
    const textElement = card.querySelector('.tx');
    if (!textElement) return;
    
    const text = textElement.textContent;
    if (!text) return;

    // On change l'icône pour montrer que ça charge
    const originalText = e.target.textContent;
    e.target.textContent = '⏳';

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (!response.ok) throw new Error('Erreur serveur');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      
      audio.play();
      audio.onended = () => {
        e.target.textContent = originalText;
        URL.revokeObjectURL(url);
      };
      
    } catch (err) {
      console.error(err);
      e.target.textContent = '❌';
      setTimeout(() => e.target.textContent = originalText, 2000);
    }
  }
});

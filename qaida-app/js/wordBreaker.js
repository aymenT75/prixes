// Segmentation des versets en granules (mots/phrases).
// Chaque granule = unité d'apprentissage (mot arabe + translittération + sens).

export function breakVerseIntoWords(verse) {
  // Segmente un verset en mots individuels.
  // Exemple: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ" → 4 mots

  const arabicWords = verse.arabic.split(/\s+/).filter(w => w.trim());
  const translitWords = verse.translit.split(/\s+/).filter(w => w.trim());
  const meaningWords = verse.meaning.split(/\s+/).filter(w => w.trim());

  return arabicWords.map((word, idx) => ({
    id: `${verse.id}.word${idx + 1}`,
    verseId: verse.id,
    type: "word",
    order: idx + 1,
    arabic: word,
    translit: translitWords[idx] || "",
    meaning: meaningWords.slice(0, Math.ceil(meaningWords.length / arabicWords.length)).join(" "),
  }));
}

export function breakVerseIntoPhrases(verse) {
  // Segmente un verset en phrases (groupes de 2-4 mots).
  // Pour niveau intermédiaire.

  const words = breakVerseIntoWords(verse);
  const phraseSize = 3; // 3 mots par phrase
  const phrases = [];

  for (let i = 0; i < words.length; i += phraseSize) {
    const phraseWords = words.slice(i, i + phraseSize);
    const phraseNum = Math.floor(i / phraseSize) + 1;

    phrases.push({
      id: `${verse.id}.phrase${phraseNum}`,
      verseId: verse.id,
      type: "phrase",
      order: phraseNum,
      arabic: phraseWords.map(w => w.arabic).join(" "),
      translit: phraseWords.map(w => w.translit).join(" "),
      meaning: phraseWords.map(w => w.meaning).join(" "),
      wordCount: phraseWords.length,
    });
  }

  return phrases;
}

export function getGranules(verse, granuleType = "word") {
  // Retourne la liste des granules pour un verset.
  // granuleType: "word" | "phrase" | "verse"

  if (granuleType === "word") {
    return breakVerseIntoWords(verse);
  } else if (granuleType === "phrase") {
    return breakVerseIntoPhrases(verse);
  } else {
    // "verse" = le verset entier
    return [{
      id: verse.id,
      verseId: verse.id,
      type: "verse",
      order: 1,
      arabic: verse.arabic,
      translit: verse.translit,
      meaning: verse.meaning,
    }];
  }
}

export function getGranuleById(verseId, granuleId, allVerses) {
  // Récupère un granule spécifique par son ID.
  const verse = allVerses.find(v => v.id === verseId);
  if (!verse) return null;

  // Essaie d'abord word
  let granules = breakVerseIntoWords(verse);
  let granule = granules.find(g => g.id === granuleId);
  if (granule) return granule;

  // Puis phrase
  granules = breakVerseIntoPhrases(verse);
  granule = granules.find(g => g.id === granuleId);
  if (granule) return granule;

  // Puis verse entier
  if (verse.id === granuleId) {
    return {
      id: verse.id,
      verseId: verse.id,
      type: "verse",
      order: 1,
      arabic: verse.arabic,
      translit: verse.translit,
      meaning: verse.meaning,
    };
  }

  return null;
}

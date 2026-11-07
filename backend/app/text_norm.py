"""One normaliser for the safety rules and the keyword extractor, so spelling and script variations
("dhuaan", "dhua", "धुआँ", "धुंआ") can never make a rule miss a danger word.

normalize("Machine 14 mein DHUAAN aa raha hai!")  -> "machine 14 mein dhuan aa raha hai"
normalize("मशीन 14 से धुआँ निकल रहा है।")          -> "मशीन 14 से धुआ निकल रहा है"

Steps: lowercase -> unify Devanagari marks (nukta, chandrabindu, anusvara) -> punctuation to spaces ->
collapse repeated Latin letters ("aaag" -> "ag") -> map common spellings to one form ("ag" -> "aag").
Keywords are passed through the SAME function, so both sides always match the same way.
"""
import re
import unicodedata

NUKTA, CHANDRABINDU, ANUSVARA = "़", "ँ", "ं"
PUNCTUATION = re.compile(r"[^a-z0-9ऀ-ॣ०-९ॱ-ॿ]+")  # keeps letters/digits; drops ।॥ too
LATIN_ACCENTS = re.compile(r"[̀-ͯ]")
REPEATS = re.compile(r"([a-z])\1+")

# After collapsing repeats: spelling variant -> one canonical form (both sides of a match use this).
SPELLINGS = {
    # smoke
    "dhua": "dhuan", "dhuwan": "dhuan", "dhuwa": "dhuan", "dhuva": "dhuan", "dhuvan": "dhuan", "dhunwa": "dhuan",
    "dhuam": "dhuan", "dhoa": "dhuan", "dhuen": "dhuan", "dhue": "dhuan", "dhuye": "dhuan", "dhuein": "dhuan",
    # fire ("aag" / "aaag" collapse to "ag")
    "ag": "aag", "agh": "aag",
    # sparks
    "chingare": "chingari", "chingri": "chingari", "chingariya": "chingari", "chingariyan": "chingari",
    "chingarian": "chingari", "chinghari": "chingari", "chingaria": "chingari", "chingariyaan": "chingari",
    # gas / smell
    "gais": "gas", "ges": "gas", "badbo": "badbu", "badboo": "badbu", "bo": "bu",
    "lek": "leak", "lik": "leak", "leakage": "leak", "leking": "leaking",
    # burning
    "jalney": "jalne", "jalnay": "jalne", "jalnei": "jalne",
    # electric current ("current" collapses to "curent")
    "karant": "curent", "karent": "curent", "karint": "curent",
    # Devanagari variants (after nukta/anusvara/chandrabindu are dropped)
    "धुवा": "धुआ", "धुए": "धुआ", "धूआ": "धुआ", "धूवा": "धुआ",
    "चिगारिया": "चिगारी", "बदबु": "बदबू", "गेस": "गैस",
    # common Hindi helper words -> Latin, so mixed-script phrases ("jalne की smell") match "jalne ki smell"
    "की": "ki", "का": "ka", "के": "ke", "से": "se", "मे": "me", "पर": "par", "है": "hai",
    "mein": "me", "main": "me",
}


def normalize(text: str) -> str:
    t = unicodedata.normalize("NFD", text or "").casefold()  # NFD splits "ज़" into "ज" + nukta
    t = t.replace(NUKTA, "").replace(CHANDRABINDU, "").replace(ANUSVARA, "")
    t = LATIN_ACCENTS.sub("", t)
    tokens = []
    for token in PUNCTUATION.sub(" ", t).split():
        if token.isascii():
            token = REPEATS.sub(r"\1", token)
        tokens.append(SPELLINGS.get(token, token))
    return " ".join(tokens)


def has_phrase(normalized_text: str, normalized_phrase: str) -> bool:
    """Whole-word match on already-normalised text ("aag" must not match inside "aage")."""
    if not normalized_phrase:
        return False
    return f" {normalized_phrase} " in f" {normalized_text} "

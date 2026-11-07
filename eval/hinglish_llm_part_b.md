## B. Real extractor on 15 representative sentences (Gemini `gemini-3.6-flash`)

- Machine correct (or correctly asked when ambiguous): **14 / 15**
- Incident type correct: **14 / 15**
- Both correct: **14 / 15**
- Real LLM requests made: **15** (cap 15); Gnani calls: 0

| Sentence | Language | Expected machine / type | Got machine / type | Extractor | Final severity | OK |
|---|---|---|---|---|---|---|
| Machine 14 mein dhuan aa raha hai | hinglish | M-14 / smoke | M-14 / smoke | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.8 s) — used keyword extractor) | critical (safety_rule) | ✅ |
| मशीन 9 की भट्टी बहुत गरम हो गई है | hindi | M-09 / overheating | M-09 / overheating | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.8 s) — used keyword extractor) | high (keyword_fallback) | ✅ |
| Sparks are coming from the LT panel | english | M-13 / sparks_fire | M-13 / sparks_fire | llm:gemini-3.6-flash | critical (safety_rule) | ✅ |
| compressor se khat khat ki awaaz aa rahi hai | hinglish | M-01 / noise | M-01 / noise | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.7 s) — used keyword extractor) | medium (keyword_fallback) | ✅ |
| Hydraulic press ke neeche tel tapak raha hai | hinglish | M-05 / oil_leak | M-05 / oil_leak | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.4 s) — used keyword extractor) | medium (keyword_fallback) | ✅ |
| Conveyor belt bahut zyada hil raha hai | hinglish | M-06 / vibration | M-06 / vibration | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.4 s) — used keyword extractor) | medium (keyword_fallback) | ✅ |
| Chemical mixing tank ke paas gas ki badbu aa rahi hai | hinglish | M-11 / gas_leak | M-11 / gas_leak | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.4 s) — used keyword extractor) | critical (safety_rule) | ✅ |
| पैकेजिंग मशीन से जलने की बदबू आ रही है | hindi | M-12 / overheating/smoke | none → asks: Kaunsi machine? Machine ka number batayiye. / gas_leak | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.4 s) — used keyword extractor) | critical (safety_rule) | ❌ |
| Machine fourteen main dhua aa raha | hinglish (STT-style) | M-14 / smoke | M-14 / smoke | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.7 s) — used keyword extractor) | critical (safety_rule) | ✅ |
| Welding robot cell mein aag lag gayi | hinglish | M-10 / sparks_fire | M-10 / sparks_fire | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.7 s) — used keyword extractor) | critical (safety_rule) | ✅ |
| The cooling tower fan is vibrating badly | english | M-03 / vibration | M-03 / vibration | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.7 s) — used keyword extractor) | medium (keyword_fallback) | ✅ |
| Thermic fluid heater ka temperature bahut badh gaya hai | hinglish | M-40 / overheating | M-40 / overheating | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.7 s) — used keyword extractor) | high (keyword_fallback) | ✅ |
| डीज़ल जनरेटर से तेल लीक हो रहा है | hindi | M-02 / oil_leak | M-02 / oil_leak | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.3 s) — used keyword extractor) | medium (keyword_fallback) | ✅ |
| teen ya tees number wali machine se awaaz aa rahi hai | hinglish (ambiguous) | ask / noise | none → asks: Kaunsi machine? Machine ka number batayiye. / noise | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.3 s) — used keyword extractor) | medium (keyword_fallback) | ✅ |
| grinding machine ke paas chingari nikal rahi hai | hinglish | M-15 / sparks_fire | M-15 / sparks_fire | keyword fallback (fallback: LLM unavailable (RateLimitError after 0.7 s) — used keyword extractor) | critical (safety_rule) | ✅ |

Single run, 15 hand-written synthetic sentences — this is a smoke check, not an accuracy figure.

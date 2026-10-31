import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Server-side Gemini AI PDF Layout, Question & Answer Key Parser
  app.post('/api/parse-pdf', async (req, res) => {
    try {
      const { rawText, title, detectedKeysHint } = req.body as {
        rawText?: string;
        title?: string;
        detectedKeysHint?: Record<string, string>;
      };

      if (!rawText || typeof rawText !== 'string') {
        res.status(400).json({ error: 'Missing PDF text payload.' });
        return;
      }

      const safeTitle = (title || 'IELTS Reading Test').slice(0, 180);
      const keysHintStr =
        detectedKeysHint && Object.keys(detectedKeysHint).length > 0
          ? `\nPre-detected Answer Keys from regex scanner (verify and include all 1-40 keys found in the text):\n${JSON.stringify(detectedKeysHint)}`
          : '';

      // Ensure both the beginning/passages and the end of the document (where Answer Keys usually live) are included
      const maxChars = 110000;
      const textPayload =
        rawText.length <= maxChars
          ? rawText
          : `${rawText.slice(0, 80000)}\n\n... [TRUNCATED MIDDLE] ...\n\n${rawText.slice(-30000)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `You are an expert IELTS on Computer (Inspera) Reading PDF parser.
Analyze the following text extracted from an IELTS Reading PDF.
Ignore all watermarks, website URLs, phone numbers, or repeating page headers/footers.
Extract all Reading Passages (Part 1, Part 2, Part 3), EVERY question (from 1 to 40), and EVERY official answer key (1 to 40) if present anywhere in the document (including English "ANSWER KEY", compact tables, or Vietnamese "ĐÁP ÁN CHI TIẾT" / "Câu 1 -> ...").

CRITICAL EXTRACTION RULES:
1. "content": Wrap each reading passage paragraph in <p>...</p> tags. Preserve paragraph letters (A, B, C...) in <strong>A</strong> if the passage uses lettered paragraphs. Do NOT include questions or answer keys inside "content".
2. "questions": Extract every single question number (e.g. 1 through 40). Never skip a question number in a range:
   - "id": integer question number (1 to 40).
   - "groupTitle": For the FIRST question of each question group (e.g., Q1, Q7, Q14, Q20, Q27...), include the FULL instructions AND any reference box such as "List of Headings (i - x)", "List of Researchers / Findings (A - G)", or Word Bank. Separate lines with "\\n" so the test taker can see the entire List of Headings or Word Bank! For subsequent questions in the same group, set "groupTitle" to "".
   - "type": strictly one of "tfng", "yes_no", "mcq", "select", or "fill":
     * "tfng": TRUE / FALSE / NOT GIVEN questions.
     * "yes_no": YES / NO / NOT GIVEN questions.
     * "mcq": Multiple choice questions (choose A, B, C or D). You MUST include the full text of each option in "options", e.g., ["A. They were built for defense", "B. They were used for trade", "C. They were abandoned early", "D. They required skilled labor"].
     * "select": Matching Headings (options: ["i","ii","iii","iv","v","vi","vii","viii","ix","x"]), Matching Paragraph Information / Features / Sentence Endings (options: ["A","B","C","D","E","F","G","H"]), Summary Completion with a Word Bank A-H, or Choose TWO letters (e.g. Questions 19 & 20: create both question 19 and question 20 with options ["A","B","C","D","E"]).
     * "fill": Gap-fill, Note/Table/Flow-chart/Diagram/Sentence/Summary Completion (without letter box), or Short Answer questions. For "fill" questions, include the surrounding sentence/bullet context in "prompt" and place "________" at the exact position of the blank for that question number.
3. "answerList": Extract all official answer keys for that part's questions:
   - If an answer has alternatives (e.g. "ageing (hoặc aging)", "(a) café", "fertiliser / fertilizer"), output all valid variants separated by " / ", e.g., "ageing / aging" or "café / a café".
   - If two questions share a pair of letters (e.g. "19 & 20: B, D"), set both question 19 and question 20 answers to "B / D".
   - Strip out explanations in parentheses or after arrows/dashes (keep only the actual answer token/words).
${keysHintStr}

Document Title: ${safeTitle}

PDF TEXT:
${textPayload}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: {
                type: Type.STRING,
                description: 'Title of the IELTS Reading test.',
              },
              parts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: {
                      type: Type.INTEGER,
                      description: 'Part number (1, 2, or 3).',
                    },
                    title: {
                      type: Type.STRING,
                      description: 'Title of the reading passage.',
                    },
                    instructions: {
                      type: Type.STRING,
                      description: 'Question range header, e.g., Questions 1–13.',
                    },
                    content: {
                      type: Type.STRING,
                      description: 'HTML paragraphs of the reading passage wrapped in <p> tags.',
                    },
                    questions: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          id: {
                            type: Type.INTEGER,
                            description: 'Question number (1-40).',
                          },
                          groupTitle: {
                            type: Type.STRING,
                            description:
                              'Full instruction text and any List of Headings / Word Bank (separated by \\n) if this is the first question of a group, otherwise empty string.',
                          },
                          type: {
                            type: Type.STRING,
                            description: 'One of: tfng, yes_no, mcq, select, fill.',
                          },
                          options: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description:
                              'Full option strings for mcq (e.g. "A. ...") or option codes for select (e.g. "i", "ii" or "A", "B").',
                          },
                          prompt: {
                            type: Type.STRING,
                            description:
                              'The question stem or sentence (with ________ for fill type).',
                          },
                        },
                      },
                    },
                    answerList: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          questionId: { type: Type.INTEGER },
                          answer: { type: Type.STRING },
                        },
                      },
                      description: 'Extracted answer keys for this part.',
                    },
                  },
                },
              },
            },
          },
        },
      });

      const rawJson = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawJson);

      if (!parsed || !Array.isArray(parsed.parts) || parsed.parts.length === 0) {
        res.status(422).json({ error: 'AI returned an empty exam structure.' });
        return;
      }

      const normalizedParts = parsed.parts.map((part: any, idx: number) => {
        const answersMap: Record<string, string> = {};
        if (Array.isArray(part.answerList)) {
          for (const item of part.answerList) {
            if (item && item.questionId && item.answer) {
              answersMap[String(item.questionId)] = String(item.answer).trim();
            }
          }
        }
        return {
          id: Number(part.id) || idx + 1,
          title: String(part.title || `Reading Passage ${idx + 1}`).trim(),
          instructions: String(part.instructions || '').trim(),
          content: String(part.content || '<p>Passage content extracted from PDF.</p>').trim(),
          questions: Array.isArray(part.questions)
            ? part.questions.map((q: any) => {
                const qType = ['tfng', 'yes_no', 'mcq', 'select', 'fill'].includes(q.type)
                  ? q.type
                  : 'fill';
                let promptStr = String(q.prompt || `Question ${q.id}`).trim();
                if (qType === 'fill' && !promptStr.includes('________')) {
                  promptStr += ' ________';
                }
                return {
                  id: Number(q.id),
                  groupTitle: q.groupTitle ? String(q.groupTitle).trim() : null,
                  type: qType,
                  options:
                    Array.isArray(q.options) && q.options.length > 0
                      ? q.options.map(String)
                      : undefined,
                  prompt: promptStr,
                };
              })
            : [],
          answers: answersMap,
        };
      });

      res.json({
        title: String(parsed.title || safeTitle).trim(),
        parts: normalizedParts,
      });
    } catch (error: any) {
      console.error('Error in /api/parse-pdf:', error);
      res.status(500).json({
        error: error?.message || 'Failed to parse PDF with Gemini AI.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

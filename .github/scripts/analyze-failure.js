#!/usr/bin/env node

/**
 * AI-Powered QA Failure Analysis Script
 * Analyzes failed QA test cases using Google Gemini API
 * Reads issue details from environment variables
 * Scans source code and identifies root causes
 * Posts analysis as GitHub issue comment
 */

const fs = require('fs');
const path = require('path');

// ════════════════════════════════════════════════════════════════════════════
// CONFIGURATION & ENVIRONMENT VARIABLES
// ════════════════════════════════════════════════════════════════════════════

const config = {
  issueNumber: process.env.ISSUE_NUMBER,
  issueTitle: process.env.ISSUE_TITLE,
  issueBody: process.env.ISSUE_BODY,
  repoOwner: process.env.REPO_OWNER,
  repoName: process.env.REPO_NAME,
  githubToken: process.env.GITHUB_TOKEN,
  googleApiKey: process.env.GOOGLE_API_KEY,
};

// Validate required environment variables
const requiredEnvVars = [
  'ISSUE_NUMBER',
  'ISSUE_TITLE',
  'ISSUE_BODY',
  'REPO_OWNER',
  'REPO_NAME',
  'GITHUB_TOKEN',
  'GOOGLE_API_KEY',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 1: SCAN REPOSITORY FOR JAVASCRIPT FILES
// ════════════════════════════════════════════════════════════════════════════

function scanRepoForJsFiles(repoRoot = '.') {
  const skipDirs = ['node_modules', '.github', 'dist', 'build', '.git'];
  const jsFiles = [];

  function walkDir(dir) {
    let files;
    try {
      files = fs.readdirSync(dir);
    } catch (err) {
      console.error(`Error reading directory ${dir}:`, err.message);
      return;
    }

    for (const file of files) {
      const filePath = path.join(dir, file);
      const relativePath = path.relative(repoRoot, filePath);

      // Skip hidden files and excluded directories
      if (file.startsWith('.') || skipDirs.some(skip => relativePath.startsWith(skip))) {
        continue;
      }

      try {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          walkDir(filePath);
        } else if (file.endsWith('.js')) {
          jsFiles.push(relativePath);
        }
      } catch (err) {
        console.error(`Error accessing ${filePath}:`, err.message);
      }
    }
  }

  walkDir(repoRoot);
  return jsFiles.sort();
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 2: READ FILE CONTENTS AND BUILD SOURCE CODE CONTEXT
// ════════════════════════════════════════════════════════════════════════════

function buildSourceCodeContext(jsFiles, repoRoot = '.') {
  let sourceContext = '';

  for (const filePath of jsFiles) {
    const fullPath = path.join(repoRoot, filePath);
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      sourceContext += `=== FILE: ${filePath} ===\n${content}\n\n`;
    } catch (err) {
      console.error(`Error reading file ${filePath}:`, err.message);
      sourceContext += `=== FILE: ${filePath} ===\n[ERROR: Could not read file]\n\n`;
    }
  }

  return sourceContext;
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 3: CALL GOOGLE GEMINI API
// ════════════════════════════════════════════════════════════════════════════

async function callGeminiAPI(issueTitle, issueBody, sourceCode, apiKey) {
  const prompt = `You are a senior software engineer doing code review.
A QA test case failed. Analyze the source code and find
the exact bug.

FAILED TEST CASE:
Title: ${issueTitle}
Details: ${issueBody}

SOURCE CODE:
${sourceCode}

Return ONLY this JSON, no markdown, no extra text:
{
  "file": "filename.js",
  "lineNumber": 42,
  "shortDescription": "one line description of the bug",
  "relevantCode": "the actual buggy code snippet (5-10 lines)",
  "suggestedFix": "the fixed version of that code"
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini API error (${response.status}):`, errorText);
      return null;
    }

    const data = await response.json();

    if (!data.candidates || data.candidates.length === 0) {
      console.error('No candidates in Gemini response');
      return null;
    }

    const content = data.candidates[0].content;
    if (!content || !content.parts || content.parts.length === 0) {
      console.error('No content parts in Gemini response');
      return null;
    }

    return content.parts[0].text;
  } catch (err) {
    console.error('Error calling Gemini API:', err.message);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 4: PARSE GEMINI RESPONSE
// ════════════════════════════════════════════════════════════════════════════

function parseGeminiResponse(responseText) {
  if (!responseText) {
    return null;
  }

  try {
    // Remove markdown code blocks if present
    let cleanedText = responseText.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.slice(7);
    }
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.slice(3);
    }
    if (cleanedText.endsWith('```')) {
      cleanedText = cleanedText.slice(0, -3);
    }

    cleanedText = cleanedText.trim();
    const parsed = JSON.parse(cleanedText);

    // Validate required fields
    const requiredFields = ['file', 'lineNumber', 'shortDescription', 'relevantCode', 'suggestedFix'];
    for (const field of requiredFields) {
      if (!parsed[field]) {
        console.error(`Missing required field in parsed JSON: ${field}`);
        return null;
      }
    }

    return parsed;
  } catch (err) {
    console.error('Error parsing Gemini response as JSON:', err.message);
    console.error('Response text:', responseText);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 5: POST GITHUB COMMENT
// ════════════════════════════════════════════════════════════════════════════

async function postGitHubComment(analysis, issueNumber, repoOwner, repoName, githubToken) {
  let comment;

  if (!analysis) {
    comment = `## ⚠️ AI Analysis Failed

> Auto-generated by QA Intelligence Engine (Phase 3 — Codebase Analysis)

---

AI analysis failed to parse response. Manual review required.`;
  } else {
    comment = `## 🔍 Root Cause Found

> Auto-generated by QA Intelligence Engine (Phase 3 — Codebase Analysis)

---

### 📍 Location
**File:** \`${analysis.file}\`
**Line:** \`${analysis.lineNumber}\`
**Issue:** ${analysis.shortDescription}

---

### 📁 Relevant Code
\`\`\`javascript
${analysis.relevantCode}
\`\`\`

---

### 💡 Suggested Fix
\`\`\`javascript
${analysis.suggestedFix}
\`\`\`

---

*To apply this fix automatically, comment \`/fix implement\` on this issue*`;
  }

  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}/comments`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: comment }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`GitHub API error (${response.status}):`, errorText);
      return false;
    }

    console.log('✅ GitHub comment posted successfully');
    return true;
  } catch (err) {
    console.error('Error posting GitHub comment:', err.message);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 6: HANDLE NO FILES FOUND
// ════════════════════════════════════════════════════════════════════════════

async function postNoFilesComment(issueNumber, repoOwner, repoName, githubToken) {
  const comment = `## ⚠️ No Source Files Found

> Auto-generated by QA Intelligence Engine (Phase 3 — Codebase Analysis)

---

No source files found for analysis.`;

  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues/${issueNumber}/comments`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: comment }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`GitHub API error (${response.status}):`, errorText);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error posting GitHub comment:', err.message);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  try {
    console.log('════════════════════════════════════════════════════════════════');
    console.log('🤖 AI QA Failure Analysis — Starting');
    console.log('════════════════════════════════════════════════════════════════');

    // Step 1: Scan for JavaScript files
    console.log('\n📁 Scanning repository for JavaScript files...');
    const jsFiles = scanRepoForJsFiles('.');

    if (jsFiles.length === 0) {
      console.warn('⚠️  No JavaScript files found in repository');
      await postNoFilesComment(
        config.issueNumber,
        config.repoOwner,
        config.repoName,
        config.githubToken
      );
      console.log('✅ Posted "no files found" comment to issue');
      return;
    }

    console.log(`✅ Found ${jsFiles.length} JavaScript file(s):`);
    jsFiles.forEach(file => console.log(`   - ${file}`));

    // Step 2: Build source code context
    console.log('\n📖 Reading source code files...');
    const sourceCode = buildSourceCodeContext(jsFiles, '.');
    console.log(`✅ Read ${sourceCode.length} characters of source code`);

    // Step 3: Call Gemini API
    console.log('\n🧠 Calling Google Gemini API for analysis...');
    const geminiResponse = await callGeminiAPI(
      config.issueTitle,
      config.issueBody,
      sourceCode,
      config.googleApiKey
    );

    if (!geminiResponse) {
      console.error('❌ Failed to get valid response from Gemini API');
      await postGitHubComment(null, config.issueNumber, config.repoOwner, config.repoName, config.githubToken);
      return;
    }

    console.log('✅ Received response from Gemini');

    // Step 4: Parse response
    console.log('\n📊 Parsing analysis result...');
    const analysis = parseGeminiResponse(geminiResponse);

    if (!analysis) {
      console.error('❌ Failed to parse Gemini response as JSON');
      await postGitHubComment(null, config.issueNumber, config.repoOwner, config.repoName, config.githubToken);
      return;
    }

    console.log('✅ Successfully parsed analysis:');
    console.log(`   - File: ${analysis.file}`);
    console.log(`   - Line: ${analysis.lineNumber}`);
    console.log(`   - Issue: ${analysis.shortDescription}`);

    // Step 5: Post GitHub comment
    console.log('\n💬 Posting analysis to GitHub issue...');
    await postGitHubComment(analysis, config.issueNumber, config.repoOwner, config.repoName, config.githubToken);

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('✅ AI Analysis Complete');
    console.log('════════════════════════════════════════════════════════════════');
  } catch (err) {
    console.error('\n❌ Unexpected error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();

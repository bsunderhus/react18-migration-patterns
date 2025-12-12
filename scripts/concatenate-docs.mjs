// @ts-check

import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import remarkStringify from "remark-stringify";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @typedef {import('unist').Parent} Parent */
/** @typedef {import('unist').Node} Node */

/**
 * Converts MDX content to clean Markdown by removing JSX elements and imports
 * @param {string} mdxContent - The MDX content to process
 * @returns {Promise<string>} - Clean Markdown content
 */
async function convertMdxToMarkdown(mdxContent) {
  try {
    const processor = unified()
      .use(remarkParse)
      .use(remarkMdx)
      .use(() =>
        /**
         * @param {Parent | Node} tree
         * @returns
         */
        (tree) => {
          if (!("children" in tree)) return;
          // Remove import and export nodes
          tree.children = tree.children.filter((node) => {
            return (
              node.type !== "mdxjsEsm" && node.type !== "mdxJsxFlowElement"
            );
          });
        }
      )
      .use(remarkStringify);

    const result = await processor.process(mdxContent);
    let markdownContent = String(result);

    // Apply manual filtering for human-only blockquotes after MDX processing
    markdownContent = removeHumanOnlyBlockquotesManual(markdownContent);

    return markdownContent;
  } catch (error) {
    console.warn(
      "⚠️ Failed to parse MDX, falling back to manual filtering:",
      error
    );
    // Fallback to manual filtering
    return removeHumanOnlyBlockquotesManual(mdxContent);
  }
}

/**
 * Manual fallback for removing Storybook content and human-only blockquotes
 * @param {string} content - The content to process
 */
function removeHumanOnlyBlockquotesManual(content) {
  const lines = content.split("\n");
  const filteredLines = [];
  let skipBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip Storybook imports
    if (line.trim().startsWith("import ") && line.includes("@storybook")) {
      continue;
    }

    // Skip Meta components
    if (line.trim().startsWith("<Meta ")) {
      continue;
    }

    // Check if this line starts a "For Humans only" blockquote
    if (line.trim().startsWith("> 🤖 *For Humans only*:")) {
      skipBlock = true;
      continue;
    }

    // If we're in a skip block, check if we've reached the end
    if (skipBlock) {
      if (line.trim() === "" || !line.trim().startsWith(">")) {
        skipBlock = false;
        filteredLines.push(line);
      }
      continue;
    }

    filteredLines.push(line);
  }

  return filteredLines.join("\n");
}

/**
 * Concatenates all .mdx files from both background and anti-patterns directories into a single ai-prompt.md file
 */
async function concatenateDocumentation() {
  try {
    const projectRoot = join(__dirname, "..");
    const srcDir = join(projectRoot, "src");
    const backgroundDir = join(srcDir, "background");
    const antiPatternsDir = join(srcDir, "anti-patterns");
    const docsDir = join(projectRoot, "docs");
    const outputFile = join(docsDir, "ai-prompt.md");

    console.log(
      "🔍 Reading .mdx files from background and anti-patterns directories"
    );

    let concatenatedContent = "";
    let totalFiles = 0;

    // Add auto-generated comment
    concatenatedContent +=
      "<!-- This file is auto-generated. Do not edit manually. -->\n\n";

    // Process background files first
    try {
      const backgroundFiles = await readdir(backgroundDir);
      const backgroundMdxFiles = backgroundFiles
        .filter((file) => file.endsWith(".mdx"))
        .sort();

      if (backgroundMdxFiles.length > 0) {
        console.log(
          `📚 Found ${backgroundMdxFiles.length} background files:`,
          backgroundMdxFiles
        );

        // Add background header
        concatenatedContent += "# Background\n\n";

        for (const file of backgroundMdxFiles) {
          const filePath = join(backgroundDir, file);
          console.log(`📖 Reading background: ${file}`);

          let fileContent = await readFile(filePath, "utf-8");
          fileContent = await convertMdxToMarkdown(fileContent);

          concatenatedContent += fileContent;
          concatenatedContent += "\n\n";
          totalFiles++;
        }
      }
    } catch (error) {
      console.log("⚠️  background directory not found or empty");
    }

    // Process anti-patterns files
    try {
      const antiPatternsFiles = await readdir(antiPatternsDir);
      const antiPatternsMdxFiles = antiPatternsFiles
        .filter((file) => file.endsWith(".mdx"))
        .sort();

      if (antiPatternsMdxFiles.length > 0) {
        console.log(
          `🚫 Found ${antiPatternsMdxFiles.length} anti-pattern files:`,
          antiPatternsMdxFiles
        );

        // Add anti-patterns header
        concatenatedContent += "# Anti-patterns\n\n";

        for (const file of antiPatternsMdxFiles) {
          const filePath = join(antiPatternsDir, file);
          console.log(`📖 Reading anti-pattern: ${file}`);

          let fileContent = await readFile(filePath, "utf-8");
          fileContent = await convertMdxToMarkdown(fileContent);

          concatenatedContent += fileContent;
          concatenatedContent += "\n\n";
          totalFiles++;
        }
      }
    } catch (error) {
      console.log("⚠️  anti-patterns directory not found or empty");
    }

    if (!concatenatedContent.trim()) {
      console.log("⚠️  No .mdx files found in either directory");
      return;
    }

    // Ensure docs directory exists
    await mkdir(docsDir, { recursive: true });

    // Write the concatenated content to the output file
    await writeFile(outputFile, concatenatedContent, "utf-8");

    console.log("✅ Successfully created ai-prompt.md");
    console.log(`📊 Total files processed: ${totalFiles}`);
    console.log(`📝 Output written to: ${outputFile}`);
  } catch (error) {
    console.error("❌ Error concatenating documentation:", error);
    process.exit(1);
  }
}

// Run the script if it's being executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  concatenateDocumentation();
}

export { concatenateDocumentation };

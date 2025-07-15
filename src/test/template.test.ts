import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";

describe("Template Feature", () => {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return;
  }

  let assert: any;

  const templateDir = path.join(workspaceFolder.uri.fsPath, "templates");
  const templateFile = path.join(templateDir, "default.typ.eta");
  const testFile = path.join(workspaceFolder.uri.fsPath, "test.typ");

  before(async () => {
    const chai = await import("chai");
    assert = chai.assert;
    // Create template directory and file
    await fs.mkdir(templateDir, { recursive: true });
    await fs.writeFile(templateFile, "Hello, <%= it.date.getFullYear() %>!");
  });

  after(async () => {
    // Clean up created files and directories
    await fs.rm(templateDir, { recursive: true, force: true });
    await fs.rm(testFile, { force: true });
  });

  it("should apply template to new .typ file", async () => {
    // Create an empty .typ file
    await fs.writeFile(testFile, "");

    // The extension should automatically apply the template.
    // We need to wait a bit for the file creation event to be processed.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const content = await fs.readFile(testFile, "utf-8");
    assert.strictEqual(content, `Hello, ${new Date().getFullYear()}!`);
  });
});

# AI Agent Coding Guidelines (AGENTS.md)

## Introduction

This document outlines the rules and best practices for AI agents assisting with software development in this codebase. The purpose of these guidelines is to ensure that AI contributions are helpful, maintainable, and align with the project's standards and the human developer's intent. Adherence to these rules will facilitate a smoother and more productive collaboration.

## Core Principles

1.  **Clarity and Simplicity:** Code should be easy to understand, well-documented, and avoid unnecessary complexity. Prioritize readability.
2.  **Respect Existing Codebase:** Understand and respect the existing architecture, patterns, and style of the codebase. Do not introduce radical changes without explicit instruction.
3.  **User-Centricity:** Always prioritize the user's (the human developer's) explicit requests and instructions.
4.  **Safety and Security:** Be mindful of security best practices. Do not introduce vulnerabilities.
5.  **Incremental Changes:** Prefer smaller, incremental changes that are easier to review and understand.

## Coding Guidelines

1.  **Understand the Goal:** Before writing any code, ensure you understand the specific problem you are trying to solve or the feature you are asked to implement. If unclear, ask for clarification.
2.  **Adhere to Style Guides:** Follow any existing coding style guides (e.g., PEP 8 for Python, Google Java Style Guide). If no explicit guide is provided, maintain consistency with the surrounding code.
3.  **Comments and Documentation:**
    * Write clear and concise comments to explain non-obvious logic, complex algorithms, or important decisions.
    * Update or add documentation (e.g., docstrings, READMEs) relevant to the changes made.
4.  **Modularity:** Write modular and reusable code where appropriate. Functions and classes should have a single responsibility.
5.  **Error Handling:** Implement robust error handling. Anticipate potential issues and handle them gracefully. Provide informative error messages.
6.  **Testing:**
    * When asked to write tests, ensure they are comprehensive and cover edge cases.
    * If modifying existing code, ensure existing tests still pass. If new functionality is added, new tests may be required.
7.  **Dependencies:**
    * Do not add new external dependencies without explicit permission.
    * If a new dependency is approved, ensure it's a well-maintained and reputable library.
8.  **Performance:** Be mindful of performance implications. Avoid inefficient algorithms or patterns unless specifically justified.
9.  **No Unsolicited Changes:**
    * **Crucially, do not add features, functionalities, or optimizations that were not explicitly requested.**
    * **Avoid making changes to parts of the codebase that are unrelated to the current task or request.** Focus solely on the defined scope.
10. **Code Formatting:** Ensure code is properly formatted before finalizing. Use linters or formatters if available and configured for the project.
11. **Variable and Function Naming:** Use descriptive and unambiguous names for variables, functions, classes, and other identifiers.

## Communication & Clarification

1.  **Ask Questions:** If a request is ambiguous, unclear, or seems to contradict previous instructions or best practices, ask for clarification before proceeding. It's better to ask than to implement something incorrectly.
2.  **State Assumptions:** If you have to make assumptions, clearly state them when presenting the code or solution.
3.  **Explain Your Work:** Briefly explain the approach taken and the reasoning behind significant decisions, especially for complex tasks.

## Scope & Focus

1.  **Stay on Task:** Concentrate on the specific task or problem you were assigned. Do not refactor unrelated code or implement features outside the current scope, even if you identify potential improvements. You can suggest these improvements separately.
2.  **Context is Key:** Pay close attention to the context provided. Use it to inform your understanding of the requirements.

## Review & Iteration

**Self-Correction:** Review your generated code for errors, adherence to guidelines, and fulfillment of the request before presenting it.

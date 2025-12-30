# Contributing to DEGIRO Portfolio Tracker

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## 🐛 Reporting Bugs

1. **Check existing issues** - Search the [Issues](../../issues) page to see if the bug has already been reported
2. **Create a new issue** - If not found, create a new issue with:
   - Clear description of the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - Your environment (OS, browser, Node.js version)

## 💡 Requesting Features

1. Open an issue with the **"Feature Request"** label
2. Describe the feature and why it would be useful
3. Include mockups or examples if possible

## 🔧 Contributing Code

### Prerequisites

- Node.js 18+ installed
- Git installed
- A GitHub account

### Setup

1. **Fork the repository**
   - Click the "Fork" button on GitHub

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/portfolio-tracker.git
   cd portfolio-tracker
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

5. **Make your changes**
   - Write clean, documented code
   - Follow existing code style
   - Add comments where necessary

6. **Test your changes**
   ```bash
   npm run dev      # Test locally
   npx tsc --noEmit # Check TypeScript
   npm run lint     # Check linting
   ```

7. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```
   
   Follow [Conventional Commits](https://www.conventionalcommits.org/) format:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation
   - `style:` for formatting changes
   - `refactor:` for code refactoring

8. **Push and create a Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```
   Then open a Pull Request on GitHub.

## 📋 Code Style Guidelines

- Use TypeScript for all new code
- Use functional components with React hooks
- Follow existing patterns in the codebase
- Keep components small and focused
- Add JSDoc comments for complex functions

## 🙏 Thank You!

Every contribution, no matter how small, makes a difference. Thank you for helping improve this project!

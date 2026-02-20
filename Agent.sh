#!/bin/bash

echo "Running agent..."

TASK=$(head -n 1 TASKS.md)

echo "Executing task: $TASK"

gemini "Read AGENT_CONTEXT.md for rules. Task: $TASK. Modify project files accordingly. After completion, summarize changes."

echo "Review changes with: git status"
echo "If satisfied, run:"
echo "git add ."
echo "git commit -m 'Agent: $TASK'"
echo "git push"

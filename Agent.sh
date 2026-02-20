#!/bin/bash

# Files
TASK_FILE="TASKS.md"
COMPLETED_FILE="COMPLETED_TASKS.md"

# Ensure COMPLETED_TASKS.md exists
touch $COMPLETED_FILE

# Read tasks line by line
while IFS= read -r TASK; do
  # Skip empty lines
  [ -z "$TASK" ] && continue

  # Skip tasks already completed
  if grep -Fxq "$TASK" $COMPLETED_FILE; then
    echo "Skipping already completed task: $TASK"
    continue
  fi

  echo "Executing task: $TASK"

  # Run Gemini with error handling
  OUTPUT=$(gemini -p "Read AGENT_CONTEXT.md. Task: $TASK. Modify project files accordingly. Summarize changes." 2>&1)

  # Check if output contains quota error
  if echo "$OUTPUT" | grep -iq "quota"; then
    echo "Quota reached. Stopping agent."
    break
  fi

  # Optionally print Gemini output
  echo "$OUTPUT"

  # Log completed task
  echo "$TASK" >> $COMPLETED_FILE

  # Ask user to commit changes
  echo "Review changes with: git status"
  echo "If satisfied, run: git add . && git commit -m 'Agent: $TASK' && git push"

done < "$TASK_FILE"

echo "Agent run complete."
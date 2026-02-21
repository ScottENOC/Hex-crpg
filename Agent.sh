#!/bin/bash

set -e

# -----------------------
# Config
# -----------------------
TASK_FILE="TASKS.md"
COMPLETED_FILE="COMPLETED_TASKS.md"
BRANCH="agent-work"
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

# -----------------------
# Ensure files exist
# -----------------------
touch "$COMPLETED_FILE"

# Ensure agent branch exists locally
if ! git show-ref --verify --quiet refs/heads/$BRANCH; then
  echo "Creating $BRANCH branch..."
  git checkout -b $BRANCH
  git push -u origin $BRANCH
  git checkout main
fi

echo "Starting agent run..."

# -----------------------
# Process tasks
# -----------------------
while IFS= read -r TASK; do

  [ -z "$TASK" ] && continue

  if grep -Fxq "$TASK" "$COMPLETED_FILE"; then
    echo "Skipping already completed task: $TASK"
    continue
  fi

  echo "---------------------------------"
  echo "Executing task: $TASK"
  echo "---------------------------------"

  OUTPUT=$(gemini -p "Read AGENT_CONTEXT.md. Task: $TASK. Modify project files accordingly. Summarize changes." 2>&1)
  GEMINI_EXIT=$?

  # Detect quota issue
  if echo "$OUTPUT" | grep -iq "quota"; then
    echo "Quota reached. Stopping agent safely."
    break
  fi

  # If Gemini failed for other reason
  if [ $GEMINI_EXIT -ne 0 ]; then
    echo "Gemini failed with exit code $GEMINI_EXIT. Stopping."
    break
  fi

  echo "$OUTPUT"

  # -----------------------
  # Commit + Push (Safe)
  # -----------------------
  if [[ -n $(git status --porcelain) ]]; then
    echo "Changes detected. Committing..."

    git checkout $BRANCH

    git add .
    git commit -m "Agent: $TASK ($TIMESTAMP)"

    git push origin $BRANCH

    echo "Changes pushed to $BRANCH."

    git checkout main
  else
    echo "No file changes detected."
  fi

  # Only mark task complete AFTER successful push
  echo "$TASK" >> "$COMPLETED_FILE"

done < "$TASK_FILE"

echo "Agent run complete."
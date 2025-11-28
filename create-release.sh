#!/bin/bash

# Script to create a tag and corresponding release branch
# Usage: ./create-tag-release.sh <tag-name>

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if tag name is provided
if [ -z "$1" ]; then
    print_error "Tag name is required!"
    echo "Usage: $0 <tag-name>"
    echo "Example: $0 v1.0.0"
    exit 1
fi

TAG_NAME="$1"
BRANCH_NAME="release/$TAG_NAME"

print_info "Starting tag and release branch creation process..."
print_info "Tag: $TAG_NAME"
print_info "Branch: $BRANCH_NAME"

# Check if we're in a git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    print_error "Not in a git repository!"
    exit 1
fi

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    print_warning "You have uncommitted changes!"
    read -p "Do you want to continue anyway? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Aborted by user."
        exit 0
    fi
fi

# Get current branch name
CURRENT_BRANCH=$(git branch --show-current)
print_info "Current branch: $CURRENT_BRANCH"

# Check if tag already exists locally
if git tag -l "$TAG_NAME" | grep -q "^$TAG_NAME$"; then
    print_error "Tag '$TAG_NAME' already exists locally!"
    exit 1
fi

# Check if tag already exists on remote
if git ls-remote --tags github | grep -q "refs/tags/$TAG_NAME$"; then
    print_error "Tag '$TAG_NAME' already exists on remote!"
    exit 1
fi

# Check if branch already exists locally
if git show-ref --verify --quiet refs/heads/$BRANCH_NAME; then
    print_error "Branch '$BRANCH_NAME' already exists locally!"
    exit 1
fi

# Check if branch already exists on remote
if git ls-remote --heads github $BRANCH_NAME | grep -q "$BRANCH_NAME"; then
    print_error "Branch '$BRANCH_NAME' already exists on remote!"
    exit 1
fi

# Create the tag on current branch
print_info "Creating tag '$TAG_NAME' on current branch..."
git tag "$TAG_NAME"

if [ $? -eq 0 ]; then
    print_info "Tag '$TAG_NAME' created successfully."
else
    print_error "Failed to create tag!"
    exit 1
fi

# Push all tags to remote
print_info "Pushing all tags to remote..."
git push github --tags

if [ $? -eq 0 ]; then
    print_info "Tags pushed successfully."
else
    print_error "Failed to push tags!"
    print_warning "Tag was created locally. You may need to delete it with: git tag -d $TAG_NAME"
    exit 1
fi

# Create the release branch from the tag
print_info "Creating branch '$BRANCH_NAME' from tag '$TAG_NAME'..."
git branch "$BRANCH_NAME" "$TAG_NAME"

if [ $? -eq 0 ]; then
    print_info "Branch '$BRANCH_NAME' created successfully."
else
    print_error "Failed to create branch!"
    print_warning "Tag was already pushed. You may need to delete it with: git push github --delete $TAG_NAME"
    exit 1
fi

# Push the release branch to remote
print_info "Pushing branch '$BRANCH_NAME' to remote..."
git push github "$BRANCH_NAME"

if [ $? -eq 0 ]; then
    print_info "Branch '$BRANCH_NAME' pushed successfully."
else
    print_error "Failed to push branch!"
    print_warning "Branch was created locally. You may need to delete it with: git branch -d $BRANCH_NAME"
    exit 1
fi

# Summary
echo ""
print_info "================================"
print_info "Process completed successfully!"
print_info "================================"
print_info "Tag created: $TAG_NAME"
print_info "Branch created: $BRANCH_NAME"
print_info "Current branch: $CURRENT_BRANCH (unchanged)"
echo "--------------------------------"
echo "--------------------------------"
print_info "Next steps:"
echo "  - Your pipeline should be triggered by the '$BRANCH_NAME' branch"
echo "  - To switch to the release branch: git checkout $BRANCH_NAME"
echo "  - To return to your current branch: git checkout $CURRENT_BRANCH"
#!/usr/bin/env python3
"""
Fix the Ghost AI interface by:
1. Removing duplicate old cards (lines 1233-1365)
2. Adding clear history button to unified card header
"""

import re

# Read the file
with open('index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Step 1: Remove lines 1233-1365 (0-indexed: 1232-1364)
# These lines contain the duplicate Activity Log, Live Monitor, and Trade History
print(f"Total lines before: {len(lines)}")
print(f"Removing lines 1233-1365 (duplicate old cards)...")

# Keep lines before and after the duplicate section
new_lines = lines[:1232] + lines[1365:]

print(f"Total lines after removal: {len(new_lines)}")

# Step 2: Find and update the unified card header to add clear button
# Looking for the line with <h3 class="card-title">Trade History</h3>
header_found = False
for i in range(len(new_lines)):
    if '<h3 class="card-title">Trade History</h3>' in new_lines[i]:
        print(f"Found unified card header at line {i+1}")
        # Replace just the title line with title + button
        indent = "                    "
        new_header = f'''{indent}<div class="header-left-section">
{indent}    <h3 class="card-title">Trade History</h3>
{indent}    <button id="clear-ghost-ai-history" class="btn-clear-history" title="Clear trade history">
{indent}        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
{indent}            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"
{indent}                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
{indent}        </svg>
{indent}    </button>
{indent}</div>
'''
        new_lines[i] = new_header
        header_found = True
        break

if not header_found:
    print("WARNING: Could not find unified card header to add button!")

# Write the modified content back
with open('index.html', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("✅ File updated successfully!")
print("✅  Removed duplicate old cards (Activity Log, Monitor, History)")
print("✅  Added clear history  button to unified card header" if header_found else "⚠️  Could not add clear button - header not found")

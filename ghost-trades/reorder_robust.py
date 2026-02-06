import re

def parse_blocks(lines):
    blocks = {}
    
    # helper to find balanced closing div
    def find_closing_div(start_idx):
        count = 0
        for i in range(start_idx, len(lines)):
            line = lines[i]
            count += line.count('<div')
            count -= line.count('</div>')
            if count <= 0:
                return i
        return -1

    markers = {
        'unified': '<div class="unified-trade-card">',
        'activity': '<div class="bot-status">',
        'config': '<div class="bot-controls">'
    }

    for name, marker in markers.items():
        for i, line in enumerate(lines):
            if marker in line:
                # Basic check to avoid finding nested or wrong things if duplicates exist (we know there are none except duplicates I removed earlier)
                # But wait, earlier I saw duplicates? I removed them.
                # Just take the first occurrence?
                # The file might have them in any order now.
                # However, bot-status might appear elsewhere (E/ODD).
                # I should only look within the ghostai-interface section.
                pass
    
    # Better approach: Extract the specific section first
    start_anchor = '<section class="ghostai-interface" id="ghostai-interface"'
    end_anchor = '<!-- GHOST E/ODD Bot Interface -->' # or closing section tag, but that is elusive
    
    start_line = -1
    end_line = -1
    
    for i, line in enumerate(lines):
        if start_anchor in line:
            start_line = i
        if end_anchor in line:
            end_line = i
            break
            
    if start_line == -1 or end_line == -1:
        print("Could not find ghostai-interface section boundaries")
        return None
        
    print(f"Section found: {start_line} to {end_line}")
    section_lines = lines[start_line:end_line]
    
    # Now find the 3 blocks within this section
    # They should be top-level divs within the section (ignoring wrapper divs if any, but there aren't any)
    
    block_info = [] # (start, end, type)
    
    i = 0
    while i < len(section_lines):
        line = section_lines[i]
        found_type = None
        if markers['unified'] in line:
            found_type = 'unified'
        elif markers['activity'] in line:
            found_type = 'activity'
        elif markers['config'] in line:
            found_type = 'config'
            
        if found_type:
            # Match brace
            count = 0
            start_blk = i
            end_blk = -1
            for j in range(i, len(section_lines)):
                l = section_lines[j]
                count += l.count('<div')
                count -= l.count('</div>')
                if count <= 0:
                    end_blk = j
                    break
            
            if end_blk != -1:
                block_info.append({
                    'type': found_type,
                    'lines': section_lines[start_blk:end_blk+1]
                })
                i = end_blk # Skip to end
            else:
                print(f"Error: Could not find closing div for {found_type}")
        i += 1
        
    return start_line, end_line, block_info

def main():
    with open('index.html', 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    res = parse_blocks(lines)
    if not res:
        return
        
    start_line, end_line, blocks = res
    
    # We want order: config -> activity -> unified
    # Check if we found all 3
    block_map = {b['type']: b['lines'] for b in blocks}
    
    if 'config' not in block_map or 'activity' not in block_map or 'unified' not in block_map:
        print("Error: Did not find all 3 blocks (config, activity, unified)")
        print(f"Found: {list(block_map.keys())}")
        return

    # Construct new section content
    # Preserve the section header (line 0 of section_lines, corresponding to start_line in file)
    # Actually start_line includes the <section> tag line.
    # The blocks start after that.
    
    # Identifying header of section (before first block)
    # It's tricky with the slice.
    # Let's just create the new content sequence.
    
    # Order: [Config] [Activity] [Unified]
    
    # Start: line containing <section...> + maybe comments
    # We can just keep the <section...> line and replace the inner content?
    # But there are comments like <!-- Unified Trade Card... --> that might be outside the divs.
    # I'll just clean insertion.
    
    new_section_content = []
    
    # Add section header line
    new_section_content.append(lines[start_line])
    # Add some whitespace/comments
    new_section_content.append('    <!-- Header Controls Removed for Mobile Optimization -->\n')
    
    # 1. Config
    new_section_content.append('    <!-- Bot Configuration -->\n')
    new_section_content.extend(block_map['config'])
    new_section_content.append('\n\n')
    
    # 2. Activity
    new_section_content.append('    <!-- Activity Log -->\n')
    new_section_content.extend(block_map['activity'])
    new_section_content.append('\n\n')
    
    # 3. Unified
    new_section_content.append('    <!-- Unified Trade Card -->\n')
    new_section_content.extend(block_map['unified'])
    new_section_content.append('\n')
    
    # Now reconstruct entire file
    final_lines = lines[:start_line] + new_section_content + lines[end_line:]
    
    with open('index.html', 'w', encoding='utf-8') as f:
        f.writelines(final_lines)
        
    print("✅ Successfully reordered: Config -> Activity -> Unified")

if __name__ == "__main__":
    main()

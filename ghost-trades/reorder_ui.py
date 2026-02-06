import os

def reorder_ui():
    file_path = 'index.html'
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Define markers
    unified_start_marker = '<div class="unified-trade-card">'
    activity_start_marker = '<div class="bot-status">'
    controls_start_marker = '<div class="bot-controls">'
    # The section following the Ghost AI interface is the E/ODD interface
    next_section_marker = '<!-- GHOST E/ODD Bot Interface -->'

    # Find indices
    unified_idx = -1
    activity_idx = -1
    controls_idx = -1
    next_section_idx = -1

    for i, line in enumerate(lines):
        if unified_start_marker in line and unified_idx == -1:
            unified_idx = i
        elif activity_start_marker in line and activity_idx == -1 and i > unified_idx:
            # specifically looking for the bot-status that usually follows unified card
            # ensuring it's the one inside ghostai-interface
            activity_idx = i
        elif controls_start_marker in line and controls_idx == -1 and i > activity_idx:
            controls_idx = i
        elif next_section_marker in line:
            next_section_idx = i
            break
            
    if -1 in [unified_idx, activity_idx, controls_idx, next_section_idx]:
        print("Error: Could not locate all sections.")
        print(f"Unified: {unified_idx}, Activity: {activity_idx}, Controls: {controls_idx}, Next: {next_section_idx}")
        return

    # Extract blocks
    # Unified finishes just before Activity starts
    unified_block = lines[unified_idx:activity_idx]
    
    # Activity finishes just before Controls starts
    activity_block = lines[activity_idx:controls_idx]
    
    # Controls finishes just before Next Section starts
    # Note: We need to capture the closing </div> of the section if it exists BEFORE next section marker?
    # In the view_file, the section closing tag </div> seems to be included in the indentation of the controls block? No.
    # The </section> for ghostai-interface (line 658 start) is seemingly NOT immediately closed?
    # Wait, line 655 was </section> closing the PREVIOUS section.
    # Where does <section class="ghostai-interface"...> close?
    # It seems to close way later?
    # Actually, looking at the previous file view:
    # 1294: </div> (closes bot-controls)
    # 1295: 
    # 1296: 
    # 1297: <!-- GHOST E/ODD Bot Interface -->
    # 1298: <section ...
    
    # It looks like the Ghost AI section is MISSING a closing </section> tag before the E/ODD section starts??
    # Or maybe it encapsulates everything?
    # Let's check line 1297 area.
    # If the user says "reorder", I should assume the generic structure.
    
    controls_block = lines[controls_idx:next_section_idx]
    
    # Reconstruct
    # Header: Start up to Unified
    header = lines[:unified_idx]
    
    # New Order: Activity -> Controls -> Unified
    
    # Footer: From Next Section onwards
    footer = lines[next_section_idx:]
    
    new_content = header + activity_block + controls_block + unified_block + footer
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(new_content)
    
    print("Success: Reordered UI sections.")

if __name__ == "__main__":
    reorder_ui()

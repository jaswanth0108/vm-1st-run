import pandas as pd
import argparse
import os
import sys

# Allowed branches based on system requirements
ALLOWED_BRANCHES = ['CSE', 'ECE', 'EEE', 'IT', 'MECH', 'CIVIL', 'AI', 'AIDS', 'DS']

def validate_branch(branch):
    """
    Validates if the branch is in the allowed list.
    Case-insensitive comparison.
    """
    if pd.isna(branch):
        return False, "Missing"
    
    branch_str = str(branch).strip().upper()
    if branch_str in ALLOWED_BRANCHES:
        return True, branch_str
    
    # Try to map common variations if needed (e.g., 'CS' -> 'CSE')
    # For now, strictly enforce allowed list or just flag it
    return False, branch_str

def transform_data(input_file, output_file):
    """
    Reads the input Excel file, transforms the data, and writes to a new Excel file.
    """
    print(f"Reading input file: {input_file}")
    
    try:
        # Read the Excel file
        df = pd.read_excel(input_file)
        
        # Check if required columns exist
        required_columns = ['StudentID', 'Password', 'Name', 'Branch', 'Year', 'Batch']
        missing_columns = [col for col in required_columns if col not in df.columns]
        
        if missing_columns:
            print(f"Error: Missing columns in input file: {missing_columns}")
            return

        # Initialize list for transformed data
        transformed_rows = []
        
        print("Transforming data...")
        
        for index, row in df.iterrows():
            # Validate Branch
            is_valid_branch, branch_val = validate_branch(row['Branch'])
            
            if not is_valid_branch:
                print(f"Warning: Row {index + 2}: Invalid Branch '{branch_val}'. Keeping original value but flagging.")
                # You could choose to set it to a default or leave it as is
            
            # Create transformed row
            new_row = {
                'StudentID': row['StudentID'],
                'Password': row['Password'],
                'Name': row['Name'],
                'Branch': branch_val, # Use standardized uppercase branch
                'Year': row['Year'],
                'Section': '', # Initialize Section as empty
                'Batch': row['Batch']
            }
            
            transformed_rows.append(new_row)
            
        # Create DataFrame from transformed rows
        new_df = pd.DataFrame(transformed_rows)
        
        # Reorder columns as requested
        output_columns = ['StudentID', 'Password', 'Name', 'Branch', 'Year', 'Section', 'Batch']
        new_df = new_df[output_columns]
        
        # Write to output Excel file
        print(f"Writing parsed data to: {output_file}")
        new_df.to_excel(output_file, index=False)
        print("Transformation complete successfully.")
        
    except FileNotFoundError:
        print(f"Error: Input file '{input_file}' not found.")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Transform student data Excel sheet.")
    parser.add_argument("input_file", help="Path to the input Excel file")
    parser.add_argument("output_file", help="Path to the output Excel file")
    
    args = parser.parse_args()
    
    transform_data(args.input_file, args.output_file)

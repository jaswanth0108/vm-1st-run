
import sys
import io

# Simulation of Piston execution
def test_input_behavior():
    # Hidden Input 1 for Factorial (from sample_questions.txt)
    # 6
    input_str_1 = "6"
    
    # Hidden Input 2 for Factorial
    # 0
    input_str_2 = "0"

    # Hidden Input 1 for Array Sum (from sample_questions.txt)
    # 5
    # 1 1 1 1 1
    input_str_3 = "5\n1 1 1 1 1"

    test_cases = [input_str_1, input_str_2, input_str_3]
    
    for i, stdin_content in enumerate(test_cases):
        print(f"--- Test Case {i+1} ---")
        print(f"Stdin: {repr(stdin_content)}")
        
        # Mock stdin
        sys.stdin = io.StringIO(stdin_content)
        
        try:
            # Simulate typical user code
            if i < 2: # Factorial cases
                line = input()
                print(f"Read: {line}")
                n = int(line)
                print(f"Parsed N: {n}")
            else: # Array Sum case
                n_line = input()
                print(f"Read N line: {n_line}")
                arr_line = input()
                print(f"Read Arr line: {arr_line}")
                
        except EOFError:
            print("ERROR: EOFError caught!")
        except Exception as e:
            print(f"ERROR: {e}")

if __name__ == "__main__":
    test_input_behavior()

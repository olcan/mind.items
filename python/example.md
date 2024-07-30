#python/example
```python_input
def my_generator():
  yield 1
  yield 2
  yield 3

# Driver code to check above generator function
for value in my_generator():
  print(value)
```
```_log
1
2
3
globals: {"value":3}
```
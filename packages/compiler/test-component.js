// Test Swiss syntax transformations
export class TestComponent extends SwissComponent {
  private count: number = 0;
  
  private message: string  = "Hello";
  
  private get doubled() {
    return this.count * 2;
  }
  
  private mount() {
    console.log('Component mounted');
  }
  
  private unmount() {
    console.log('Component unmounted');
  }
  
  private effect() {
    console.log('Effect running');
  }
}

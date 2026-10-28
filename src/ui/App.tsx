import { Box, Text } from 'ink';
import { useEffect } from 'react';

export default function App() {
  useEffect(() => {
    const t = setTimeout(() => process.exit(0), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <Box>
      <Text>trimd (build stub)</Text>
    </Box>
  );
}

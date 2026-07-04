import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Compress an image to JPEG at 65% quality, max 1200px on the longest edge.
 * Target output: ~300KB.
 */
export async function compressImage(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1200 } }],
    { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}

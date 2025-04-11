/**
 * Generates a lowercase acronym from the capital letters in a username.
 * Returns an empty string if no capitals are found or username is empty.
 * @param username The bot's username.
 * @returns The lowercase acronym or an empty string.
 */
export function generateAcronym(username: string): string {
    if (!username) return '';
    const capitals = username.match(/[A-Z]/g); // Find all capital letters using regex
    return capitals ? capitals.join('').toLowerCase() : ''; // Join found capitals and convert to lowercase
  }
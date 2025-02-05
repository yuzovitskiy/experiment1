export const abi = [
"function mint(address to) external",
  "function totalSupply() public view returns (uint16)",
  "function MAX_SUPPLY() public view returns (uint16)",
  "function MAX_PER_WALLET() public view returns (uint8)",
  "function mintsPerWallet(address) public view returns (uint8)",
  "function tokenURI(uint256 tokenId) public view returns (string)",
  "event MintCompleted(address indexed minter, uint256 indexed tokenId, uint256 timestamp)"
];

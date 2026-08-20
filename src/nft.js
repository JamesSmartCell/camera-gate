import { createPublicClient, http } from 'viem'
import { config } from './config.js'

const ERC721_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
]

const client = createPublicClient({
  transport: http(config.rpcUrl),
})

export function isAdmin(address) {
  return config.adminAddrs.includes(String(address).toLowerCase())
}

export async function hasGarageAccess(address) {
  if (isAdmin(address)) return true
  const balance = await client.readContract({
    address: config.nftContract,
    abi: ERC721_BALANCE_ABI,
    functionName: 'balanceOf',
    args: [address],
  })
  return BigInt(balance) > 0n
}

export async function firstAuthorizedAddress(addresses) {
  for (const address of addresses) {
    if (await hasGarageAccess(address)) return address
  }
  return null
}

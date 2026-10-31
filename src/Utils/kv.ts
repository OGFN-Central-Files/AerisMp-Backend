import Keyv from "keyv";

const memkv = new Keyv();

export class KVClass {
  async get(key: string): Promise<any> {
    return await memkv.get(key);
  }
  async set(key: string, value: any): Promise<boolean> {
    const result = await memkv.set(key, value);
    return result === true;
  }
  async setTTL(key: string, value: any, ttl: number): Promise<boolean> {
    const result = await memkv.set(key, value, ttl);
    return result === true;
  }
}

export default new KVClass();

const { accounts, contract } = require('@openzeppelin/test-environment');
const { expect } = require('chai');
const {
  BN,           // Big Number support
  constants,    // Common constants, like the zero address and largest integers
  expectEvent,  // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');

const Mute = contract.fromArtifact('Mute');
const MuteSwap = contract.fromArtifact('MuteSwap');
const MuteVault = contract.fromArtifact('MuteVault');

const BigNumber = require('bignumber.js');
const DECIMALS = 18;
function toTokenDenomination (x) {
  return new BigNumber(x).times(10 ** DECIMALS).toFixed();
}

const INITIAL_SUPPLY = toTokenDenomination(1);
const TAX_FRACTION = 100;


describe('Mute:Create', function () {
  const [owner, user1, user2, user3, user4, user5] =  accounts;

  beforeEach(async function () {
    this.value = new BN(1);

    this.token = await Mute.new();
    this.vault = await MuteVault.new(this.token.address, this.token.address)
    await this.token.initialize({from: owner});
    await this.token.setTaxReceiveAddress(this.vault.address, {from: owner});
    await this.token.setTaxFraction(TAX_FRACTION, {from: owner});
    this.swap = await MuteSwap.new(this.token.address, {from: owner});


    await this.token.addMinter(this.swap.address, {from: owner});

    await this.swap.addSwapInfo([owner], [toTokenDenomination(1)], {from: owner});
    await this.swap.claimSwap({from: owner});
  });

  describe('Mute::initialize', function () {
    it('can only initialize once', async function () {
      await expectRevert(
        this.token.initialize({from: user1}),
        'Mute::Initialize: Contract has already been initialized',
      );
    });
  });

  describe('Mute:minting', function () {
    it('allows minting to eligible claims', async function () {
      var startBalance = await this.token.balanceOf(user1);
      await this.swap.addSwapInfo([user1], [toTokenDenomination(10)], {from: owner});
      await this.swap.claimSwap({from: user1});
      var endBalance = await this.token.balanceOf(user1);
      expect(startBalance).to.be.bignumber.eq("0");
      expect(endBalance).to.be.bignumber.eq(toTokenDenomination(10));
      expect(await this.token.totalSupply.call()).to.be.bignumber.eq(toTokenDenomination(11));

      await expectRevert(
        this.swap.claimSwap({from: user1}),
        'MuteSwap::claimSwap: must have a balance greater than 0',
      );
    });

    it('denies minting to false claims', async function () {
      await expectRevert(
        this.swap.claimSwap({from: user1}),
        'MuteSwap::claimSwap: must have a balance greater than 0',
      );
    });
  });


  describe('Mute:totalSupply', function () {
    it('returns the total amount of tokens', async function () {
      expect(await this.token.totalSupply.call()).to.be.bignumber.eq(INITIAL_SUPPLY);
    });
  });

  describe('Mute:balanceOf', function () {
    describe('when the requested account has no tokens', function () {
      it('returns zero', async function () {
        expect(await this.token.balanceOf.call(user1)).to.be.bignumber.eq('0');
      });
    });

    describe('when the requested account has some tokens', function () {
      it('returns the total amount of tokens', async function () {
        expect(await this.token.balanceOf.call(owner)).to.be.bignumber.eq(INITIAL_SUPPLY);
      });
    });
  });

  describe('Mute:transfer', function () {
    it('reverts when transferring tokens to the zero address', async function () {
      // Conditions that trigger a require statement can be precisely tested
      await expectRevert(
        this.token.transfer(constants.ZERO_ADDRESS, this.value, { from: user1 }),
        'Mute: transfer to the zero address',
      );
    });

    it('emits a Transfer event on successful transfers', async function () {
      const receipt = await this.token.transfer(
        user1, this.value, { from: owner }
      );

      // Event assertions can verify that the arguments are the expected ones
      expectEvent(receipt, 'Transfer', {
        from: owner,
        to: user1,
        value: this.value,
      });
    });

    it('updates balances on successful transfers', async function () {
      await this.token.transfer(user1, this.value, { from: owner });

      expect(await this.token.balanceOf(user1))
        .to.be.bignumber.equal(this.value);
    });

    it('applies universal tax of 1% for transfer', async function () {
      await this.token.transfer(user1, this.value, { from: owner });

      expect(await this.token.balanceOf(user1))
        .to.be.bignumber.equal(this.value);

      await this.token.transfer(user2, this.value, { from: user1 });

      const expectedValue = new BN(this.value - (this.value / TAX_FRACTION));
      const expectedTaxValue = new BN(this.value / TAX_FRACTION);

      expect(await this.token.balanceOf(user1))
        .to.be.bignumber.equal(expectedValue);

      expect(await this.token.balanceOf(this.vault.address))
        .to.be.bignumber.equal(expectedTaxValue);
    });
  });

  describe('Mute:setTaxReceiveAddress', function () {
    it('reverts when not called by owner', async function () {
      // Conditions that trigger a require statement can be precisely tested
      await expectRevert(
        this.token.setTaxReceiveAddress(this.vault.address, { from: user1 }),
        'Mute::OnlyOwner: Not the owner',
      );
    });

    it('sets tax receive address called by owner', async function () {
      await this.token.setTaxReceiveAddress(this.vault.address, { from: owner });
      expect((await this.token.taxReceiveAddress.call()) == this.vault.address);
    });
  });

  describe('Mute:setAddressTax', function () {
    it('reverts when not called by owner', async function () {
      // Conditions that trigger a require statement can be precisely tested
      await expectRevert(
        this.token.setAddressTax(user1, { from: user1 }),
        'Mute::OnlyOwner: Not the owner',
      );
    });

    it('sets address tax on successful call', async function () {
      await this.token.setAddressTax(user1, true, { from: owner });
      expect((await this.token.nonTaxedAddresses(user1)) == user1);
    });
  });

  describe('Mute:setTaxFraction', function () {
    it('reverts when not called by owner', async function () {
      // Conditions that trigger a require statement can be precisely tested
      await expectRevert(
        this.token.setTaxFraction(50, { from: user1 }),
        'Mute::OnlyOwner: Not the owner',
      );
    });

    it('sets tax fraction on successful call', async function () {
      await this.token.setTaxFraction(50, { from: owner });
      expect(await this.token.TAX_FRACTION.call()).to.be.bignumber.eq("50");
    });
  });

  describe('Mute::delegates', function () {
    it('should fix delegate transfer bug', async function () {
        await this.token.delegate(user3, {from: owner})
        await this.token.transfer(user1, toTokenDenomination(1), {from: owner} )
        await this.token.delegate(user3, {from: user1})
        await this.token.transfer(user2, toTokenDenomination(0.99), {from: user1} )
        await this.token.delegate(user3, {from: user2})
        await this.token.transfer(owner, toTokenDenomination(0.9801), {from: user2} )

        //await this.token.delegate(this.vault.address, {from: this.vault.address})

        expect(await this.token.totalSupply.call()).to.be.bignumber.equal(toTokenDenomination(1));
        expect(await this.token.getCurrentVotes(user3)).to.be.bignumber.equal(toTokenDenomination(0.970299));
        expect(await this.token.getCurrentVotes(owner)).to.be.bignumber.equal(toTokenDenomination(0));
        expect(await this.token.getCurrentVotes(user1)).to.be.bignumber.equal(toTokenDenomination(0));
        expect(await this.token.getCurrentVotes(user2)).to.be.bignumber.equal(toTokenDenomination(0));
        //expect(await this.token.getCurrentVotes(this.vault.address)).to.be.bignumber.equal(toTokenDenomination(0.029701));
    })
  });

  describe('Mute::vault', function () {
    it('should send rewards after 10k accumulated', async function () {
      await this.swap.addSwapInfo([user1], [toTokenDenomination(1500000)], {from: owner});
      await this.swap.claimSwap({from: user1});

      await this.token.transfer(user2, toTokenDenomination(1500000), {from: user1} )
      expect(await this.token.balanceOf(this.vault.address)).to.be.bignumber.equal(toTokenDenomination(15000));

      await this.token.transfer(user3, toTokenDenomination(1), {from: user2} )

      expect(await this.token.balanceOf(this.token.address)).to.be.bignumber.equal(toTokenDenomination(15000));
    })
  });

});
